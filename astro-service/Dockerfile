FROM python:3.10-slim

# Установка зависимостей для pyswisseph
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Создание директории приложения
WORKDIR /app

# Копирование файлов зависимостей
COPY requirements.txt .

# Установка зависимостей
RUN pip install --no-cache-dir -r requirements.txt

# Создание директории для эфемерид
RUN mkdir -p /app/ephe

# Загрузка эфемерид для pyswisseph
RUN python -c "import swisseph as swe; swe.set_ephe_path('/app/ephe'); swe.close()"

# Копирование исходного кода
COPY . .

# Создание директории для логов
RUN mkdir -p /app/logs

# Открытие порта
EXPOSE 3003

# Запуск приложения
CMD ["uvicorn", "src.app:app", "--host", "0.0.0.0", "--port", "3003"]
