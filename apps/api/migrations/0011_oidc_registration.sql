-- Динамическая регистрация клиентов OpenID Connect (RFC 7591, #47).
-- Клиент, зарегистрированный сам, выключен до проверки администратором.
ALTER TABLE oauth_client ADD COLUMN pending_review boolean NOT NULL DEFAULT false;

-- Начальные токены доступа (RFC 7591 §3): выдаёт администратор, в базе — только sha256.
CREATE TABLE oauth_initial_token (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash  text NOT NULL UNIQUE,
  note        text,
  uses_left   integer NOT NULL CHECK (uses_left >= 0),
  expires_at  timestamptz NOT NULL,
  created_by  uuid REFERENCES app_user (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
