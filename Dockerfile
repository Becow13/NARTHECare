FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.js app.js ./
COPY lib ./lib
COPY services ./services
COPY integrations ./integrations

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "server.js"]
