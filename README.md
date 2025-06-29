# CosmoOracle

![CosmoOracle Logo](https://via.placeholder.com/800x200?text=CosmoOracle)

CosmoOracle - это полнофункциональное веб-приложение для астрологических и таро-сервисов с интеграцией ИИ, поддержкой PWA, различными платежными системами и реферальной программой.

## 🌟 Возможности

- **Астрология**: Расчет натальных карт, интерпретация планетарных позиций
- **Таро**: Различные расклады (1 карта, 3 карты, Кельтский крест)
- **Гороскопы**: Ежедневные, еженедельные и ежемесячные персональные прогнозы
- **Нумерология**: Расчет жизненного пути, числа судьбы и других показателей
- **Лунный календарь**: Расчет лунных дней и фаз луны с рекомендациями
- **ИИ-чат**: Виртуальный астролог на базе Llama 4 через OpenRouter
- **Мультиязычность**: Поддержка русского, английского и испанского языков
- **Авторизация**: Email/пароль, Telegram OAuth, Google OAuth
- **Платежи**: Stripe, Telegram Stars, YooKassa
- **Реферальная система**: Бонусы за приглашенных пользователей
- **PWA**: Оффлайн-режим, push-уведомления, установка на устройство
- **Админ-панель**: Управление пользователями, контентом и настройками

## 🛠️ Технический стек

### Frontend
- Next.js
- React
- TailwindCSS
- Atlantis Lite (шаблон админ-панели)

### Backend
- Fastify (Node.js)
- PostgreSQL
- Redis

### Астрологический движок
- Python с pyswisseph

### Интеграции
- OpenRouter (Llama 4)
- Stripe, YooKassa, Telegram Stars
- Telegram OAuth, Google OAuth

## 📋 Структура проекта

```
CosmoOracle/
├── frontend/           # Next.js + React + TailwindCSS
├── backend/            # Fastify API
├── admin/              # Express.js + EJS (админ-панель)
├── astro-service/      # Python микросервис для астрологических расчетов
├── init-scripts/       # Скрипты инициализации базы данных
├── docker-compose.yml  # Конфигурация Docker Compose
├── .env.example        # Пример переменных окружения
├── setup.sh            # Скрипт установки
└── README.md           # Документация
```

## 🚀 Быстрый старт

### Предварительные требования

- Docker и Docker Compose
- Node.js 18+ (для локальной разработки)
- Python 3.9+ (для локальной разработки)

### Установка с помощью Docker

1. Клонируйте репозиторий:
   ```bash
   git clone https://github.com/NoCoDeer/cosmooracle.git
   cd cosmooracle
   ```

2. Создайте файл .env на основе .env.example:
   ```bash
   cp .env.example .env
   ```

3. Отредактируйте .env файл, добавив необходимые API ключи и настройки.

4. Запустите приложение с помощью Docker Compose:
   ```bash
   docker-compose up -d
   ```

5. Откройте в браузере:
   - Веб-приложение: http://localhost:3000
   - Админ-панель: http://localhost:3002 (логин: admin@cosmooracle.com, пароль: admin)
   - API: http://localhost:3001

### Установка на сервер Ubuntu 22.04 + CyberPanel

Для установки на сервер с Ubuntu 22.04 и CyberPanel используйте скрипт setup.sh:

```bash
sudo chmod +x setup.sh
sudo ./setup.sh
```

Скрипт автоматически настроит все необходимые компоненты, включая Docker, Nginx, SSL и резервное копирование.

## 🔧 Разработка

### Локальная разработка Frontend

```bash
cd frontend
npm install
npm run dev
```

### Локальная разработка Backend

```bash
cd backend
npm install
npm run dev
```

### Локальная разработка Astro Service

```bash
cd astro-service
pip install -r requirements.txt
python app.py
```

## 📱 PWA

Для использования PWA-возможностей:

1. Откройте приложение в браузере на мобильном устройстве
2. Добавьте на главный экран через меню браузера
3. Разрешите push-уведомления при запросе

## 🔐 API

API документация доступна по адресу: http://localhost:3001/api/docs

Основные эндпоинты:

- `POST /api/auth/login` - Авторизация
- `POST /api/auth/register` - Регистрация
- `GET /api/auth/me` - Информация о текущем пользователе
- `GET /api/horoscope/today` - Гороскоп на сегодня
- `POST /api/tarot/draw` - Расклад Таро
- `POST /api/astro/chart` - Расчет натальной карты
- `GET /api/numerology/:id` - Нумерологический расчет
- `POST /api/pay/stripe` - Оплата через Stripe
- `POST /api/pay/yookassa` - Оплата через YooKassa
- `POST /api/pay/telegram` - Оплата через Telegram Stars

## 🔄 Обновление

Для обновления приложения:

```bash
cd /var/www/cosmooracle
git pull
docker-compose down
docker-compose up -d
```

## 📦 Резервное копирование

Резервные копии автоматически создаются ежедневно в директории `/var/backups/cosmooracle`.

Для ручного создания резервной копии:

```bash
sudo /etc/cron.daily/cosmooracle-backup
```

Для восстановления из резервной копии:

```bash
cd /var/www/cosmooracle
docker-compose down
tar -xzf /var/backups/cosmooracle/cosmooracle-YYYY-MM-DD.tar.gz -C /var/www/cosmooracle
docker-compose up -d
```

## 🤝 Вклад в проект

Мы приветствуем вклад в развитие проекта! Пожалуйста, следуйте этим шагам:

1. Форкните репозиторий
2. Создайте ветку для вашей функции (`git checkout -b feature/amazing-feature`)
3. Зафиксируйте изменения (`git commit -m 'Add some amazing feature'`)
4. Отправьте изменения в ваш форк (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект распространяется под лицензией MIT. См. файл `LICENSE` для получения дополнительной информации.

## 📞 Поддержка

Если у вас возникли проблемы или вопросы, пожалуйста, создайте issue в репозитории или свяжитесь с нами по адресу support@cosmooracle.com.
