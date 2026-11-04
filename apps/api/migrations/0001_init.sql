-- Начальная схема BioAuth Optimizer (docs/05-data-model.md).
-- Инварианты закреплены в схеме: CHECK, NOT NULL, UNIQUE.

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
  UNIQUE (catalog_id, code)
);

CREATE TABLE score_dataset (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name              text NOT NULL,
  original_filename text NOT NULL,
  genuine_count     integer NOT NULL CHECK (genuine_count > 0),
  impostor_count    integer NOT NULL CHECK (impostor_count > 0),
  genuine_scores    bytea NOT NULL CHECK (octet_length(genuine_scores)  = genuine_count  * 8),
  impostor_scores   bytea NOT NULL CHECK (octet_length(impostor_scores) = impostor_count * 8),
  sha256            char(64) NOT NULL UNIQUE,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE experiment (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type              experiment_type   NOT NULL,
  status            experiment_status NOT NULL,
  input             jsonb NOT NULL,
  result            jsonb NOT NULL,
  input_hash        char(64) NOT NULL,
  solver            text,
  core_version      text NOT NULL,
  duration_ms       integer NOT NULL CHECK (duration_ms >= 0),
  factor_catalog_id uuid REFERENCES factor_catalog(id) ON DELETE SET NULL,
  score_dataset_id  uuid REFERENCES score_dataset(id)  ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX experiment_type_created_idx ON experiment (type, created_at DESC, id DESC);
CREATE INDEX experiment_created_idx      ON experiment (created_at DESC, id DESC);
CREATE INDEX experiment_input_hash_idx   ON experiment (input_hash);
CREATE INDEX experiment_catalog_idx      ON experiment (factor_catalog_id);
CREATE INDEX experiment_dataset_idx      ON experiment (score_dataset_id);
