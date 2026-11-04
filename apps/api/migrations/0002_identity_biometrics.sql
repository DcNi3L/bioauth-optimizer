-- v2: пользователи, согласие, шаблоны лица, passkey, политики входа, попытки и оценки (docs/10 §10.9).
-- Инварианты закреплены в схеме: диапазоны оценок, одна активная политика, версия модели у каждой оценки.

CREATE TABLE app_user (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  login           text NOT NULL CHECK (login ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  display_name    text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 200),
  role            text NOT NULL CHECK (role IN ('subject', 'admin', 'researcher', 'auditor')),
  password_hash   text,
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_user_login_key UNIQUE (login),
  -- у сотрудников (не субъектов) обязателен пароль
  CONSTRAINT app_user_staff_password CHECK (role = 'subject' OR password_hash IS NOT NULL)
);

CREATE TABLE user_session (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash   char(64) NOT NULL UNIQUE,            -- sha256 токена; сам токен хранится только в cookie
  mfa_complete boolean NOT NULL,
  webauthn_challenge text,                          -- вызов регистрации passkey / второго фактора сотрудника
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  CHECK (expires_at > created_at)
);
CREATE INDEX user_session_user_idx ON user_session (user_id);

CREATE TABLE consent (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  text_version text NOT NULL,
  granted_at   timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
);
-- не более одного действующего согласия у субъекта
CREATE UNIQUE INDEX consent_active_idx ON consent (user_id) WHERE revoked_at IS NULL;

CREATE TABLE face_template (
  user_id       uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  ciphertext    bytea NOT NULL,                     -- AES-256-GCM(эмбеддинг) || тег 16 байт
  iv            bytea NOT NULL CHECK (octet_length(iv) = 12),
  key_id        text NOT NULL,
  cancelable    boolean NOT NULL,                    -- хранится проекция P·e (ISO/IEC 24745)
  model_version text NOT NULL,
  samples       integer NOT NULL CHECK (samples > 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE webauthn_credential (
  credential_id text PRIMARY KEY,                    -- base64url
  user_id       uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  public_key    bytea NOT NULL,
  counter       bigint NOT NULL CHECK (counter >= 0),
  transports    text[] NOT NULL DEFAULT '{}',
  device_type   text NOT NULL,
  backed_up     boolean NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz
);
CREATE INDEX webauthn_credential_user_idx ON webauthn_credential (user_id);

CREATE TABLE auth_policy (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         integer NOT NULL UNIQUE CHECK (version > 0),
  steps           jsonb NOT NULL,
  costs           jsonb NOT NULL,
  rationale       text,
  experiment_id   uuid REFERENCES experiment(id) ON DELETE SET NULL,
  status          text NOT NULL CHECK (status IN ('proposed', 'active', 'retired', 'rejected')),
  proposed_by     uuid REFERENCES app_user(id) ON DELETE SET NULL,
  decided_by      uuid REFERENCES app_user(id) ON DELETE SET NULL,
  decided_at      timestamptz,
  decision_note   text,
  created_at      timestamptz NOT NULL DEFAULT now()
);
-- ровно одна активная политика (вторая активация нарушит индекс)
CREATE UNIQUE INDEX auth_policy_single_active_idx ON auth_policy ((true)) WHERE status = 'active';

-- Сессия входа по политике: выданные команды, nonce, текущий шаг (UC-4).
CREATE TABLE auth_session (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid REFERENCES app_user(id) ON DELETE CASCADE,  -- NULL — неизвестный логин (ложная сессия)
  policy_id          uuid NOT NULL REFERENCES auth_policy(id),
  nonce              char(32) NOT NULL,
  commands           text[] NOT NULL,
  step_index         integer NOT NULL DEFAULT 0 CHECK (step_index >= 0),
  failures           integer NOT NULL DEFAULT 0 CHECK (failures >= 0),
  state              text NOT NULL CHECK (state IN ('pending', 'accepted', 'rejected', 'expired')),
  webauthn_challenge text,
  face_accepted      boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL,
  completed_at       timestamptz
);
CREATE INDEX auth_session_user_idx ON auth_session (user_id);

CREATE TABLE auth_attempt (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid REFERENCES app_user(id) ON DELETE SET NULL,
  policy_id     uuid REFERENCES auth_policy(id) ON DELETE SET NULL,
  session_id    uuid REFERENCES auth_session(id) ON DELETE SET NULL,
  factor        text NOT NULL CHECK (factor IN ('face', 'passkey')),
  outcome       text NOT NULL CHECK (outcome IN ('accept', 'reject', 'error', 'cancel')),
  score         double precision CHECK (score BETWEEN -1 AND 1),
  liveness      double precision CHECK (liveness BETWEEN 0 AND 1),
  challenges_ok boolean,
  duration_ms   integer NOT NULL CHECK (duration_ms >= 0),
  reject_reason text,
  model_version text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX auth_attempt_created_idx ON auth_attempt (created_at DESC, id DESC);
CREATE INDEX auth_attempt_user_idx ON auth_attempt (user_id, created_at DESC);
CREATE INDEX auth_attempt_session_idx ON auth_attempt (session_id);
CREATE INDEX auth_attempt_policy_idx ON auth_attempt (policy_id);

CREATE TABLE score_sample (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  attempt_id    uuid REFERENCES auth_attempt(id) ON DELETE SET NULL,
  user_id       uuid REFERENCES app_user(id) ON DELETE SET NULL,
  modality      text NOT NULL CHECK (modality IN ('face', 'fingerprint', 'pad')),
  kind          text NOT NULL CHECK (kind IN ('genuine', 'impostor', 'attack', 'bonafide')),
  score         double precision NOT NULL CHECK (score BETWEEN -1 AND 1),
  model_version text NOT NULL,
  source        text NOT NULL CHECK (source IN ('enroll', 'login', 'cross', 'pad_test', 'batch')),
  attack_type   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((modality = 'pad') = (kind IN ('attack', 'bonafide')))
);
CREATE INDEX score_sample_calibration_idx ON score_sample (modality, model_version, kind, created_at);
CREATE INDEX score_sample_attempt_idx ON score_sample (attempt_id);
CREATE INDEX score_sample_user_idx ON score_sample (user_id);

-- Начальная политика до первой калибровки (docs/10 §10.5.4): τ_face = 0,363 (пример OpenCV для SFace), τ_pad = 0,5.
INSERT INTO auth_policy (version, steps, costs, rationale, status, decided_at)
VALUES (
  1,
  '[{"factor": "face", "tauFace": 0.363, "tauPad": 0.5, "commands": 3, "calibrated": false}]',
  '{"cFA": 10, "cFR": 1}',
  'Начальная политика: порог SFace из примера OpenCV, порог PAD 0,5; не откалибрована',
  'active',
  now()
);
