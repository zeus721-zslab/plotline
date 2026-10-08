# 로컬 개발용 이미지 (vite dev 서버)
FROM node:24.21.0-alpine

RUN npm install -g pnpm@12.10.1

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .

EXPOSE 5173
CMD ["pnpm", "dev"]
