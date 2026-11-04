# 05. Модель данных (PostgreSQL 16, Prisma)

## 5.1. Принципы

- Эксперимент **неизменяем** и самодостаточен: полный вход (включая копию факторов, а не ссылку) и полный результат хранятся в `jsonb`. Если позже отредактировать каталог, история не изменится.
- Инварианты закреплены в схеме (`CHECK`, `NOT NULL`, `UNIQUE`), а не только в коде.
- Оценки сходства хранятся компактно, в `bytea` (Float64 little-endian): миллион оценок занимает 8 МБ, а не десятки мегабайт JSON.
- Мягкого удаления нет: каталоги удаляются физически, ссылки из экспериментов обнуляются (`ON DELETE SET NULL`).

## 5.2. ER-диаграмма

```mermaid
erDiagram
  FACTOR_CATALOG ||--o{ FACTOR : contains
  FACTOR_CATALOG |o--o{ EXPERIMENT : "used by"
  SCORE_DATASET  |o--o{ EXPERIMENT : "used by"

  FACTOR_CATALOG {
    uuid id PK
    text name UK
    text description
    boolean is_preset
    timestamptz created_at
    timestamptz updated_at
  }
  FACTOR {
    uuid id PK
    uuid catalog_id FK
    varchar code "UK with catalog_id"
    text name
    float8 far "0 < far < 1"
    float8 frr "0 <= frr < 1"
    float8 latency_ms ">= 0"
    float8 cost ">= 0"
    boolean has_pad
    int position
  }
  SCORE_DATASET {
    uuid id PK
    text name
    text original_filename
    int genuine_count "> 0"
    int impostor_count "> 0"
    bytea genuine_scores
    bytea impostor_scores
    char sha256 UK
    timestamptz created_at
  }
  EXPERIMENT {
    uuid id PK
    experiment_type type
    experiment_status status
    jsonb input
    jsonb result
    char input_hash
    text solver
    text core_version
    int duration_ms
    uuid factor_catalog_id FK
    uuid score_dataset_id FK
    timestamptz created_at
  }
```

## 5.3. DDL (целевая схема первой миграции)

```sql
CREATE TYPE experiment_type   AS ENUM ('THRESHOLD', 'FACTOR_SELECTION', 'BUDGET_SWEEP');
CREATE TYPE experiment_status AS ENUM ('OK', 'INFEASIBLE');

CREATE TABLE factor_catalog (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE CHECK (length(name) BETWEEN 1 AND 200),
  description text,
  is_preset   boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE factor (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id  uuid NOT NULL REFERENCES factor_catalog(id) ON DELETE CASCADE,
  code        varchar(16) NOT NULL,
  name        text NOT NULL,
  far         double precision NOT NULL CHECK (far > 0 AND far < 1),
  frr         double precision NOT NULL CHECK (frr >= 0 AND frr < 1),
  latency_ms  double precision NOT NULL CHECK (latency_ms >= 0),
  cost        double precision NOT NULL CHECK (cost >= 0),
  has_pad     boolean NOT NULL DEFAULT false,
  position    integer NOT NULL,
  UNIQUE (catalog_id, code)           -- заодно служит индексом по catalog_id
);

CREATE TABLE score_dataset (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  original_filename text NOT NULL,
  genuine_count     integer NOT NULL CHECK (genuine_count > 0),
  impostor_count    integer NOT NULL CHECK (impostor_count > 0),
  genuine_scores    bytea NOT NULL CHECK (octet_length(genuine_scores)  = genuine_count  * 8),
  impostor_scores   bytea NOT NULL CHECK (octet_length(impostor_scores) = impostor_count * 8),
  sha256            char(64) NOT NULL UNIQUE,          -- повторная загрузка того же файла не дублирует данные
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experiment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              experiment_type   NOT NULL,
  status            experiment_status NOT NULL,
  input             jsonb NOT NULL,
  result            jsonb NOT NULL,
  input_hash        char(64) NOT NULL,                 -- sha256 канонического JSON входа
  solver            text,
  core_version      text NOT NULL,
  duration_ms       integer NOT NULL CHECK (duration_ms >= 0),
  factor_catalog_id uuid REFERENCES factor_catalog(id) ON DELETE SET NULL,
  score_dataset_id  uuid REFERENCES score_dataset(id)  ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX experiment_type_created_idx ON experiment (type, created_at DESC, id DESC);  -- история с фильтром + keyset
CREATE INDEX experiment_input_hash_idx   ON experiment (input_hash);
CREATE INDEX experiment_catalog_idx      ON experiment (factor_catalog_id);
CREATE INDEX experiment_dataset_idx      ON experiment (score_dataset_id);
```

## 5.4. Начальные данные (seed)

Каталог `«СРО1 — модельный пример (табл. 2)»` с `is_preset = true` и факторами F1–F5 из [02-mathematical-model.md §2.3](02-mathematical-model.md). Seed идемпотентен (`upsert` по имени каталога).

## 5.5. Миграции

- `prisma migrate deploy` выполняется при старте контейнера `api` до запуска сервера (см. 06-deployment).
- Миграции только вперёд; каждая следующая миграция должна быть совместима с кодом предыдущей версии (expand → migrate → contract).
