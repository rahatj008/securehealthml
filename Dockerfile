FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ENV NODE_OPTIONS=--max-old-space-size=1536
RUN npm run build

ENV NODE_ENV=production

EXPOSE 3000

CMD ["npx", "next", "start", "-p", "3000"]
