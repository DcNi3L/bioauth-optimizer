# syntax=docker/dockerfile:1
# REST API (NestJS). Многоэтапная сборка: в образ попадают только api и его зависимости из монорепо.

FROM node:24-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# Git-хуки husky в образе не нужны (и .git в контексте сборки нет).
ENV HUSKY=0
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @bioauth/api --docker

FROM base AS builder
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@bioauth/api...
RUN pnpm --filter=@bioauth/api deploy --prod --legacy /app

FROM node:24-alpine AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder --chown=node:node /app .
USER node
EXPOSE 4000
# Миграции и идемпотентный seed выполняются до запуска сервера (ADR-0011).
CMD ["sh", "-c", "node dist/shared/database/migrate.cli.js && exec node dist/main.js"]
