FROM node:18-alpine

WORKDIR /app

# Копируем package.json сначала для кэширования зависимостей
COPY package*.json ./
RUN npm install --production

# Копируем исходный код
COPY . .

# Создаем папку для статических файлов если её нет
RUN mkdir -p public

# Открываем порт
EXPOSE 3000

# Запускаем приложение
CMD ["npm", "start"]
