# 06. Развёртывание (Docker, docker-compose)

## 6.1. Схема развёртывания

```mermaid
flowchart LR
  B["Браузер<br/>localhost:3000"] --> WEB
  subgraph net["docker network: bioauth"]
    WEB["web<br/>node:22-alpine<br/>next start · :3000"]
    API["api<br/>node:22-alpine<br/>migrate.cli → node dist/main · :4000"]
    DB[("db<br/>postgres:16-alpine<br/>:5432")]
    VOL[["volume: pgdata"]]
  end
  WEB -- "/api/* → http://api:4000" --> API
  API --> DB
  DB --- VOL
  SW["Swagger<br/>localhost:4000/api/docs"] -.-> API
```

Порядок запуска гарантируется `depends_on: condition: service_healthy`: db → api (миграции + seed, затем healthcheck `/health/ready`) → web.

## 6.2. Файлы

| Файл | Назначение |
| --- | --- |
| [`docker-compose.yml`](../docker-compose.yml) | Три сервиса: `db`, `api`, `web`; healthcheck'и и порядок запуска |
| [`docker/api.Dockerfile`](../docker/api.Dockerfile) | Сборка API: `turbo prune` → `pnpm install --frozen-lockfile` → `turbo build` → `pnpm deploy --prod` |
| [`docker/web.Dockerfile`](../docker/web.Dockerfile) | Сборка интерфейса: Next.js `output: "standalone"`, запуск `node apps/web/server.js` |
| [`.dockerignore`](../.dockerignore) | Исключает `node_modules`, `dist`, `.next`, `.git` и секреты |

## 6.3. Как устроены образы

- **Многоэтапная сборка.** `turbo prune @bioauth/api --docker` оставляет в контексте только api и пакеты, от которых он зависит (`optimization-core`, `contracts`, `config`). Сначала копируются одни `package.json` и lockfile — слой с зависимостями кэшируется, пока они не меняются.
- **Продуктовый образ api** содержит только `dist`, `migrations` и production-зависимости (`pnpm deploy --prod`). При старте контейнера выполняется `node dist/shared/database/migrate.cli.js` (SQL-миграции и идемпотентный seed каталога СРО1, ADR-0011), затем `exec node dist/main.js`.
- **Образ web** — standalone-сборка Next.js. Адрес API для rewrites (`API_INTERNAL_URL=http://api:4000`) задаётся аргументом сборки, поэтому браузер обращается к `/api/*` на том же origin, и CORS не нужен.
- Оба процесса работают от непривилегированного пользователя `node`.
- **Проверено:** шаги обоих Dockerfile'ов (prune, установка по lockfile, сборка, deploy) и запуск получившихся сборок проверены на реальном PostgreSQL 16. Полный `docker compose up --build` и e2e-тесты против контейнеров выполняет CI (`.github/workflows/ci.yml`, задача `docker`).

## 6.4. Переменные окружения

| Переменная | Сервис | По умолчанию | Назначение |
| --- | --- | --- | --- |
| `DATABASE_URL` | api | — (обязательна) | Строка подключения PostgreSQL |
| `PORT` | api | 4000 | Порт HTTP |
| `CORS_ORIGIN` | api | <http://localhost:3000> | Разрешённый origin |
| `MAX_UPLOAD_MB` | api | 50 | Лимит размера CSV |
| `LOG_LEVEL` | api | info | Уровень логов pino |
| `API_INTERNAL_URL` | web (сборка) | <http://api:4000> | Адрес API для rewrites Next.js |
| `NEXT_PUBLIC_SWAGGER_URL` | web (сборка) | <http://localhost:4000/api/docs> | Ссылка «API (Swagger)» в шапке |
| `POSTGRES_PASSWORD` | db, api | bioauth | Пароль БД (для локального запуска; в `.env`, не в git) |

Все переменные api валидируются zod-схемой при старте: без `DATABASE_URL` процесс завершается с понятной ошибкой.

## 6.5. Команды

```bash
docker compose up --build        # поднять всё
docker compose down -v           # остановить и удалить данные
pnpm install && pnpm build       # локальная сборка всех пакетов
docker compose up db -d          # только база для разработки
DATABASE_URL=postgresql://bioauth:bioauth@localhost:55432/bioauth pnpm --filter @bioauth/api migrate
pnpm dev                         # api :4000 и web :3000 в режиме разработки
pnpm test                        # все тесты (для e2e API задайте TEST_DATABASE_URL)
pnpm --filter @bioauth/web test:e2e   # e2e в браузере против запущенной системы
```
