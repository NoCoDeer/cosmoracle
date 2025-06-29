FROM node:16-alpine

# Создание директории приложения
WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Создание директории для логов
RUN mkdir -p logs

# Открытие порта
EXPOSE 3002

# Запуск приложения
CMD ["node", "src/index.js"]
