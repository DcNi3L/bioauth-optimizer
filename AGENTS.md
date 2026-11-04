# AGENTS.md — правила разработки BioAuth Optimizer

Файл для разработчика и ИИ-ассистента (Claude Code и др.). Прочитать перед написанием кода.

## Источники правды
1. `docs/02-mathematical-model.md` — формулы и алгоритмы. Код ядра обязан ему соответствовать; при расхождении сначала исправляется документ.
2. `docs/adr/` — принятые решения. Не нарушать без нового ADR.
3. `docs/04-api.md` + `packages/contracts` — контракт API.

## Порядок работы
- Ядро пишется **test-first**: сначала золотой тест из `07-testing.md §7.2`, потом реализация.
- Любой баг в расчётах → сначала регрессионный тест, потом исправление.
- Перед коммитом: `pnpm lint && pnpm typecheck && pnpm test`.

## Жёсткие правила
- `optimization-core`: никаких `@nestjs/*`, `next`, `react`, `kysely`, `pg`, `process.env`, `fs`, `Date.now()` в расчётах, `Math.random()` без явного seed.
- Вероятности хвостов — только `erfc`/`erfcinv`; произведения — в лог-пространстве; сравнения `≤` — только через `leq()` из `numeric/tolerance.ts` (ADR-0008).
- Нельзя округлять числа в ядре и API.
- `apps/web` не импортирует `optimization-core` (ADR-0009).
- Валидация — только zod-схемы из `@bioauth/contracts`; class-validator не использовать.
- TypeScript `strict: true`, `noUncheckedIndexedAccess: true`; `any` запрещён.

## Бэкенд (ADR-0003)
- Новый модуль: `presentation/ application/ infrastructure/ <name>.module.ts`.
- Один use case — один класс с методом `execute(command)`; зависимости — только порты (интерфейсы) через токены DI.
- Контроллер не содержит логики: разобрать вход → вызвать use case → вернуть DTO.
- Ошибки — доменные исключения, которые `ProblemDetailsFilter` переводит в RFC 7807; без «голых» `catch {}`.

## Фронтенд (ADR-0004, FSD)
- Шаблон слайса: `ui/`, `model/`, `api/`, `lib/`, `index.ts` (public API). Импорт из слайса — только через `index.ts`.
- Импорт только вниз по слоям: app → pages → widgets → features → entities → shared.
- Корневой `app/` — только маршрутизация (реэкспорт из `src/pages`).
- Числа выводить через `shared/lib/format` (научная нотация с «·10⁻ⁿ», запятая как десятичный разделитель).

## Именование
- Файлы: kebab-case с суффиксом роли — `*.use-case.ts`, `*.controller.ts`, `*.repository.ts`, `*.solver.ts`, `*.adapter.ts`.
- Коммиты: Conventional Commits (`feat(core): certified ilp solver`).
