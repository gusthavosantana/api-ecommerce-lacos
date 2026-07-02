FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

RUN npm install

COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]
