FROM node:22-alpine
WORKDIR /app
COPY . .
RUN corepack enable && pnpm install --frozen-lockfile=false
CMD ["pnpm", "--filter", "@project12/miniapp", "dev", "--host", "0.0.0.0"]
