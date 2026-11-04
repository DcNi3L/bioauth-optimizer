# Архитектурные решения (ADR)

Формат — сокращённый MADR: контекст → решение → рассмотренные альтернативы → последствия. Статусы: *Принято*, *Отклонено*, *Заменено ADR-XXXX*. Новое решение получает следующий номер; принятые ADR не переписываются — вместо этого создаётся новый ADR, который заменяет старый.

| № | Решение | Статус |
| --- | --- | --- |
| [0001](0001-monorepo-modular-monolith.md) | Монорепозиторий pnpm + Turborepo, модульный монолит | Принято |
| [0002](0002-pure-optimization-core.md) | Математика — отдельный чистый TypeScript-пакет | Принято |
| [0003](0003-backend-nestjs-clean-architecture.md) | Бэкенд: NestJS + Clean/Hexagonal по модулям | Принято |
| [0004](0004-frontend-nextjs-fsd.md) | Фронтенд: Next.js App Router + Feature-Sliced Design | Принято |
| [0005](0005-storage-postgres-no-redis-rabbit.md) | PostgreSQL; без Redis и RabbitMQ (ORM — см. 0011) | Принято, частично заменено 0011 |
| [0006](0006-threshold-analytic-with-verification.md) | Порог: аналитическое решение + численная верификация; эмпирический — точный перебор | Принято |
| [0007](0007-factor-selection-two-solvers.md) | Состав факторов: полный перебор + линеаризованное ЦЛП (HiGHS) с сертификатом | Принято |
| [0008](0008-numerical-precision.md) | Численная точность: лог-пространство, допуск ε, спецфункции @stdlib | Принято |
| [0009](0009-shared-zod-contracts.md) | Единые zod-контракты; все вычисления на сервере | Принято |
| [0010](0010-docker-compose.md) | Развёртывание через Docker Compose | Принято |
| [0011](0011-kysely-instead-of-prisma.md) | Kysely + pg и SQL-миграции вместо Prisma | Принято (заменяет часть 0005) |
