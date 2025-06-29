FROM node:18-alpine

# Создание рабочей директории
WORKDIR /app

# Установка зависимостей
COPY package*.json ./
RUN npm ci --only=production

# Копирование исходного кода
COPY . .

# Создание директории для статических файлов
RUN mkdir -p public/assets/img

# Установка переменных окружения
ENV NODE_ENV=production
ENV PORT=3001

# Открытие порта
EXPOSE 3001

# Запуск приложения
CMD ["node", "src/index.js"]
