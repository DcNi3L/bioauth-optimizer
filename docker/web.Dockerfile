# syntax=docker/dockerfile:1
# Интерфейс (Next.js, output: standalone).

FROM node:25-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
# Git-хуки husky в образе не нужны (и .git в контексте сборки нет).
ENV HUSKY=0
WORKDIR /repo

FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.11.10 prune @bioauth/web --docker

FROM base AS builder
# Адрес API для серверных rewrites Next.js фиксируется при сборке.
ARG API_INTERNAL_URL=http://api:4000
ARG NEXT_PUBLIC_API_DOCS_URL=http://localhost:4000/api/docs
# Публичный адрес сайта — для канонических ссылок, Open Graph, robots.txt и sitemap.xml.
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV API_INTERNAL_URL=$API_INTERNAL_URL NEXT_PUBLIC_API_DOCS_URL=$NEXT_PUBLIC_API_DOCS_URL \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL NEXT_TELEMETRY_DISABLED=1
COPY --from=pruner /repo/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /repo/out/full/ .
RUN pnpm turbo run build --filter=@bioauth/web...

FROM node:25-alpine AS runner
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=builder --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=builder --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
# Иконки PWA, service worker и снимки для манифеста.
COPY --from=builder --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
