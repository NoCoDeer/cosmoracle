#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
CosmoOracle - Астрологический микросервис
Основной файл сервера FastAPI для астрологических расчетов
"""

import os
import json
import logging
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Union
from math import cos, radians

import pytz
import swisseph as swe
import uvicorn
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("astro_service.log")
    ]
)
logger = logging.getLogger("astro_service")

# Инициализация FastAPI
app = FastAPI(
    title="CosmoOracle Astro Service",
    description="Микросервис для астрологических расчетов",
    version="1.0.0",
)

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация Swiss Ephemeris
EPHEMERIS_PATH = os.environ.get("EPHEMERIS_PATH", "/app/ephe")
swe.set_ephe_path(EPHEMERIS_PATH)

# Константы
PLANETS = {
    "sun": swe.SUN,
    "moon": swe.MOON,
    "mercury": swe.MERCURY,
    "venus": swe.VENUS,
    "mars": swe.MARS,
    "jupiter": swe.JUPITER,
    "saturn": swe.SATURN,
    "uranus": swe.URANUS,
    "neptune": swe.NEPTUNE,
    "pluto": swe.PLUTO,
    "north_node": swe.MEAN_NODE,
    "south_node": swe.MEAN_NODE + 1,  # Условное обозначение
    "chiron": swe.CHIRON,
}

ZODIAC_SIGNS = [
    "Овен", "Телец", "Близнецы", "Рак",
    "Лев", "Дева", "Весы", "Скорпион",
    "Стрелец", "Козерог", "Водолей", "Рыбы"
]

HOUSE_SYSTEMS = {
    "placidus": b'P',
    "koch": b'K',
    "porphyrius": b'O',
    "regiomontanus": b'R',
    "campanus": b'C',
    "equal": b'E',
    "whole_sign": b'W',
}

ASPECTS = {
    "conjunction": {"angle": 0, "orb": 8},
    "opposition": {"angle": 180, "orb": 8},
    "trine": {"angle": 120, "orb": 8},
    "square": {"angle": 90, "orb": 7},
    "sextile": {"angle": 60, "orb": 6},
    "quincunx": {"angle": 150, "orb": 5},
    "semi_sextile": {"angle": 30, "orb": 3},
    "semi_square": {"angle": 45, "orb": 3},
    "sesqui_square": {"angle": 135, "orb": 3},
    "quintile": {"angle": 72, "orb": 2},
    "bi_quintile": {"angle": 144, "orb": 2},
}

# Модели данных
class BirthData(BaseModel):
    date: str = Field(..., description="Дата рождения в формате YYYY-MM-DD")
    time: str = Field(..., description="Время рождения в формате HH:MM")
    latitude: float = Field(..., description="Широта места рождения")
    longitude: float = Field(..., description="Долгота места рождения")
    timezone: str = Field("UTC", description="Часовой пояс в формате IANA (например, 'Europe/Moscow')")
    house_system: str = Field("placidus", description="Система домов")

class PlanetPosition(BaseModel):
    planet: str
    sign: str
    degree: float
    minutes: int
    seconds: int
    retrograde: bool
    house: Optional[int] = None
    sign_num: int

class Aspect(BaseModel):
    planet1: str
    planet2: str
    aspect_type: str
    angle: float
    orb: float
    applying: bool

class NatalChart(BaseModel):
    planets: List[PlanetPosition]
    houses: List[Dict[str, Union[int, float, str]]]
    aspects: List[Aspect]
    ascendant: float
    midheaven: float
    descendant: float
    imum_coeli: float

class TransitChart(BaseModel):
    date: str
    planets: List[PlanetPosition]
    aspects_to_natal: List[Aspect]

class LunarInfo(BaseModel):
    date: str
    phase_name: str
    phase_percent: float
    sign: str
    day_number: int
    next_new_moon: str
    next_full_moon: str

# Вспомогательные функции
def get_julian_day(date_str: str, time_str: str, timezone: str) -> float:
    """Получение юлианского дня из даты и времени"""
    dt_str = f"{date_str} {time_str}"
    dt = datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
    
    if timezone != "UTC":
        tz = pytz.timezone(timezone)
        dt = tz.localize(dt).astimezone(pytz.UTC)
    
    jd = swe.julday(
        dt.year,
        dt.month,
        dt.day,
        dt.hour + dt.minute / 60.0
    )
    return jd

def get_planet_position(planet_id: int, jd: float) -> Dict:
    """Получение позиции планеты"""
    flags = swe.FLG_SWIEPH | swe.FLG_SPEED
    result = swe.calc_ut(jd, planet_id, flags)
    
    longitude = result[0]
    retrograde = result[3] < 0
    
    sign_num = int(longitude / 30)
    sign = ZODIAC_SIGNS[sign_num]
    
    pos_in_sign = longitude % 30
    degree = int(pos_in_sign)
    minutes = int((pos_in_sign - degree) * 60)
    seconds = int(((pos_in_sign - degree) * 60 - minutes) * 60)
    
    return {
        "longitude": longitude,
        "sign": sign,
        "sign_num": sign_num,
        "degree": degree,
        "minutes": minutes,
        "seconds": seconds,
        "retrograde": retrograde,
        "speed": result[3]
    }

def get_houses(jd: float, lat: float, lon: float, house_system: str) -> Dict:
    """Получение домов гороскопа"""
    houses = swe.houses(jd, lat, lon, HOUSE_SYSTEMS.get(house_system, b'P'))
    
    house_cusps = houses[0]
    ascendant = houses[1][0]
    midheaven = houses[1][1]
    descendant = (ascendant + 180) % 360
    imum_coeli = (midheaven + 180) % 360
    
    house_data = []
    for i, cusp in enumerate(house_cusps[1:], 1):
        sign_num = int(cusp / 30)
        pos_in_sign = cusp % 30
        
        house_data.append({
            "house_num": i,
            "longitude": cusp,
            "sign": ZODIAC_SIGNS[sign_num],
            "sign_num": sign_num,
            "degree": int(pos_in_sign),
            "minutes": int((pos_in_sign - int(pos_in_sign)) * 60)
        })
    
    return {
        "house_cusps": house_cusps,
        "houses": house_data,
        "ascendant": ascendant,
        "midheaven": midheaven,
        "descendant": descendant,
        "imum_coeli": imum_coeli
    }

def calculate_aspects(planet_positions: List[Dict]) -> List[Dict]:
    """Расчет аспектов между планетами"""
    aspects = []
    
    for i, p1 in enumerate(planet_positions):
        for j, p2 in enumerate(planet_positions):
            if j <= i:  # Избегаем дублирования и аспектов планеты с самой собой
                continue
            
            # Расчет угла между планетами
            angle = abs(p1["longitude"] - p2["longitude"])
            if angle > 180:
                angle = 360 - angle
            
            # Проверка на аспекты
            for aspect_name, aspect_data in ASPECTS.items():
                aspect_angle = aspect_data["angle"]
                orb = aspect_data["orb"]
                
                if abs(angle - aspect_angle) <= orb:
                    # Определение, приближается ли аспект или удаляется
                    applying = (p1["speed"] > p2["speed"]) if angle < 180 else (p1["speed"] < p2["speed"])
                    
                    aspects.append({
                        "planet1": p1["planet"],
                        "planet2": p2["planet"],
                        "aspect_type": aspect_name,
                        "angle": angle,
                        "orb": abs(angle - aspect_angle),
                        "applying": applying
                    })
    
    return aspects

def calculate_natal_chart(birth_data: BirthData) -> NatalChart:
    """Расчет натальной карты"""
    jd = get_julian_day(birth_data.date, birth_data.time, birth_data.timezone)
    
    # Получение домов
    houses_data = get_houses(
        jd, 
        birth_data.latitude, 
        birth_data.longitude, 
        birth_data.house_system
    )
    
    # Получение позиций планет
    planet_positions = []
    for planet_name, planet_id in PLANETS.items():
        # Особая обработка для Южного узла
        if planet_name == "south_node":
            north_node_pos = get_planet_position(PLANETS["north_node"], jd)
            position = north_node_pos.copy()
            position["longitude"] = (position["longitude"] + 180) % 360
            
            sign_num = int(position["longitude"] / 30)
            pos_in_sign = position["longitude"] % 30
            
            position["sign"] = ZODIAC_SIGNS[sign_num]
            position["sign_num"] = sign_num
            position["degree"] = int(pos_in_sign)
            position["minutes"] = int((pos_in_sign - position["degree"]) * 60)
            position["seconds"] = int(((pos_in_sign - position["degree"]) * 60 - position["minutes"]) * 60)
        else:
            position = get_planet_position(planet_id, jd)
        
        # Определение дома для планеты
        house_num = 1
        for i in range(1, 13):
            next_house = i % 12 + 1
            if (houses_data["house_cusps"][i] <= position["longitude"] < houses_data["house_cusps"][next_house]) or \
               (houses_data["house_cusps"][i] > houses_data["house_cusps"][next_house] and 
                (position["longitude"] >= houses_data["house_cusps"][i] or 
                 position["longitude"] < houses_data["house_cusps"][next_house])):
                house_num = i
                break
        
        position["house"] = house_num
        position["planet"] = planet_name
        planet_positions.append(position)
    
    # Расчет аспектов
    aspects = calculate_aspects(planet_positions)
    
    return NatalChart(
        planets=[
            PlanetPosition(
                planet=p["planet"],
                sign=p["sign"],
                degree=p["degree"],
                minutes=p["minutes"],
                seconds=p["seconds"],
                retrograde=p["retrograde"],
                house=p["house"],
                sign_num=p["sign_num"]
            ) for p in planet_positions
        ],
        houses=houses_data["houses"],
        aspects=[
            Aspect(
                planet1=a["planet1"],
                planet2=a["planet2"],
                aspect_type=a["aspect_type"],
                angle=a["angle"],
                orb=a["orb"],
                applying=a["applying"]
            ) for a in aspects
        ],
        ascendant=houses_data["ascendant"],
        midheaven=houses_data["midheaven"],
        descendant=houses_data["descendant"],
        imum_coeli=houses_data["imum_coeli"]
    )

def calculate_transits(birth_data: BirthData, transit_date: str, transit_time: str = "12:00") -> TransitChart:
    """Расчет транзитов на указанную дату"""
    # Получение натальной карты
    natal_chart = calculate_natal_chart(birth_data)
    
    # Расчет позиций планет на дату транзита
    transit_jd = get_julian_day(transit_date, transit_time, "UTC")
    
    transit_positions = []
    for planet_name, planet_id in PLANETS.items():
        if planet_name == "south_node":
            north_node_pos = get_planet_position(PLANETS["north_node"], transit_jd)
            position = north_node_pos.copy()
            position["longitude"] = (position["longitude"] + 180) % 360
            
            sign_num = int(position["longitude"] / 30)
            pos_in_sign = position["longitude"] % 30
            
            position["sign"] = ZODIAC_SIGNS[sign_num]
            position["sign_num"] = sign_num
            position["degree"] = int(pos_in_sign)
            position["minutes"] = int((pos_in_sign - position["degree"]) * 60)
            position["seconds"] = int(((pos_in_sign - position["degree"]) * 60 - position["minutes"]) * 60)
        else:
            position = get_planet_position(planet_id, transit_jd)
        
        position["planet"] = planet_name
        transit_positions.append(position)
    
    # Расчет аспектов между транзитными и натальными планетами
    transit_to_natal_aspects = []
    
    for transit_planet in transit_positions:
        for natal_planet in [p.dict() for p in natal_chart.planets]:
            # Расчет угла между планетами
            angle = abs(transit_planet["longitude"] - natal_planet["longitude"])
            if angle > 180:
                angle = 360 - angle
            
            # Проверка на аспекты
            for aspect_name, aspect_data in ASPECTS.items():
                aspect_angle = aspect_data["angle"]
                orb = aspect_data["orb"] * 0.8  # Уменьшаем орб для транзитов
                
                if abs(angle - aspect_angle) <= orb:
                    # Определение, приближается ли аспект или удаляется
                    applying = transit_planet["speed"] > 0
                    
                    transit_to_natal_aspects.append({
                        "planet1": f"transit_{transit_planet['planet']}",
                        "planet2": f"natal_{natal_planet['planet']}",
                        "aspect_type": aspect_name,
                        "angle": angle,
                        "orb": abs(angle - aspect_angle),
                        "applying": applying
                    })
    
    return TransitChart(
        date=transit_date,
        planets=[
            PlanetPosition(
                planet=p["planet"],
                sign=p["sign"],
                degree=p["degree"],
                minutes=p["minutes"],
                seconds=p["seconds"],
                retrograde=p["retrograde"],
                sign_num=p["sign_num"]
            ) for p in transit_positions
        ],
        aspects_to_natal=[
            Aspect(
                planet1=a["planet1"],
                planet2=a["planet2"],
                aspect_type=a["aspect_type"],
                angle=a["angle"],
                orb=a["orb"],
                applying=a["applying"]
            ) for a in transit_to_natal_aspects
        ]
    )

def calculate_lunar_info(date_str: str, timezone: str = "UTC") -> LunarInfo:
    """Расчет информации о Луне на указанную дату"""
    jd = get_julian_day(date_str, "12:00", timezone)
    
    # Получение позиции Луны
    moon_pos = get_planet_position(swe.MOON, jd)
    
    # Расчет лунной фазы
    sun_pos = get_planet_position(swe.SUN, jd)
    phase_angle = (moon_pos["longitude"] - sun_pos["longitude"]) % 360
    
    # Определение названия фазы
    if phase_angle < 45:
        phase_name = "Новолуние"
    elif phase_angle < 90:
        phase_name = "Растущая четверть"
    elif phase_angle < 135:
        phase_name = "Первая четверть"
    elif phase_angle < 180:
        phase_name = "Растущая луна"
    elif phase_angle < 225:
        phase_name = "Полнолуние"
    elif phase_angle < 270:
        phase_name = "Убывающая луна"
    elif phase_angle < 315:
        phase_name = "Последняя четверть"
    else:
        phase_name = "Убывающая четверть"
    
    # Расчет процента освещенности
    phase_percent = 50 * (1 - cos(radians(phase_angle)))
    
    # Определение лунного дня
    lunar_day = int((phase_angle / 360) * 30) + 1
    if lunar_day > 30:
        lunar_day = 30
    
    # Поиск ближайшего новолуния и полнолуния
    next_new_moon = None
    next_full_moon = None
    
    # Поиск в пределах 30 дней
    for days in range(1, 31):
        future_jd = jd + days
        future_moon_pos = get_planet_position(swe.MOON, future_jd)
        future_sun_pos = get_planet_position(swe.SUN, future_jd)
        future_phase_angle = (future_moon_pos["longitude"] - future_sun_pos["longitude"]) % 360
        
        # Новолуние (фаза около 0 градусов)
        if future_phase_angle < 5 and not next_new_moon:
            dt = datetime(2000, 1, 1) + timedelta(days=future_jd - 2451544.5)
            next_new_moon = dt.strftime("%Y-%m-%d")
        
        # Полнолуние (фаза около 180 градусов)
        if abs(future_phase_angle - 180) < 5 and not next_full_moon:
            dt = datetime(2000, 1, 1) + timedelta(days=future_jd - 2451544.5)
            next_full_moon = dt.strftime("%Y-%m-%d")
        
        if next_new_moon and next_full_moon:
            break
    
    return LunarInfo(
        date=date_str,
        phase_name=phase_name,
        phase_percent=phase_percent,
        sign=moon_pos["sign"],
        day_number=lunar_day,
        next_new_moon=next_new_moon,
        next_full_moon=next_full_moon
    )

# Маршруты API
@app.get("/")
async def root():
    """Корневой маршрут"""
    return {
        "name": "CosmoOracle Astro Service",
        "version": "1.0.0",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """Проверка работоспособности сервиса"""
    return {"status": "ok", "timestamp": datetime.now().isoformat()}

@app.post("/natal-chart", response_model=NatalChart)
async def get_natal_chart(birth_data: BirthData):
    """Расчет натальной карты"""
    try:
        return calculate_natal_chart(birth_data)
    except Exception as e:
        logger.error(f"Error calculating natal chart: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating natal chart: {str(e)}")

@app.post("/transits", response_model=TransitChart)
async def get_transits(birth_data: BirthData, date: str = Query(..., description="Дата для расчета транзитов")):
    """Расчет транзитов на указанную дату"""
    try:
        return calculate_transits(birth_data, date)
    except Exception as e:
        logger.error(f"Error calculating transits: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating transits: {str(e)}")

@app.get("/lunar-info", response_model=LunarInfo)
async def get_lunar_info(date: str = Query(..., description="Дата для расчета лунной информации"),
                         timezone: str = Query("UTC", description="Часовой пояс")):
    """Получение информации о Луне на указанную дату"""
    try:
        return calculate_lunar_info(date, timezone)
    except Exception as e:
        logger.error(f"Error calculating lunar info: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating lunar info: {str(e)}")

@app.get("/planet-positions")
async def get_planet_positions(date: str = Query(..., description="Дата в формате YYYY-MM-DD"),
                              time: str = Query("12:00", description="Время в формате HH:MM"),
                              timezone: str = Query("UTC", description="Часовой пояс")):
    """Получение позиций планет на указанную дату и время"""
    try:
        jd = get_julian_day(date, time, timezone)
        
        positions = {}
        for planet_name, planet_id in PLANETS.items():
            if planet_name == "south_node":
                continue  # Пропускаем Южный узел, так как он рассчитывается отдельно
            
            position = get_planet_position(planet_id, jd)
            positions[planet_name] = {
                "sign": position["sign"],
                "degree": position["degree"],
                "minutes": position["minutes"],
                "retrograde": position["retrograde"]
            }
        
        # Добавляем Южный узел
        north_node_pos = positions["north_node"]
        south_node_sign_num = (ZODIAC_SIGNS.index(north_node_pos["sign"]) + 6) % 12
        positions["south_node"] = {
            "sign": ZODIAC_SIGNS[south_node_sign_num],
            "degree": north_node_pos["degree"],
            "minutes": north_node_pos["minutes"],
            "retrograde": north_node_pos["retrograde"]
        }
        
        return positions
    except Exception as e:
        logger.error(f"Error calculating planet positions: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error calculating planet positions: {str(e)}")

# Запуск сервера
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 3003))
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=False)
