-- v3.3: второй фактор без лица и passkey — приложение-аутентификатор (TOTP, RFC 6238) и коды восстановления.

-- Секрет TOTP хранится только в зашифрованном виде (AES-256-GCM, ключи TEMPLATE_KEYS, AAD = «totp|user_id»).
CREATE TABLE user_totp (
  user_id         uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  secret_enc      bytea       NOT NULL CHECK (octet_length(secret_enc) BETWEEN 17 AND 128),
  iv              bytea       NOT NULL CHECK (octet_length(iv) = 12),
  key_id          text        NOT NULL,
  confirmed_at    timestamptz,                    -- NULL: секрет выдан, но ещё не подтверждён первым кодом
  last_counter    bigint      NOT NULL DEFAULT 0, -- последний принятый шаг времени: код нельзя использовать дважды
  failed_attempts integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- Коды восстановления: хранятся только HMAC-хэши, использованный код гасится.
CREATE TABLE user_recovery_code (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  code_hash  text        NOT NULL CHECK (code_hash ~ '^[0-9a-f]{64}$'),
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, code_hash)
);
CREATE INDEX user_recovery_code_user_idx ON user_recovery_code (user_id) WHERE used_at IS NULL;

-- История входов: новые способы.
ALTER TABLE login_event DROP CONSTRAINT login_event_method_check;
ALTER TABLE login_event ADD CONSTRAINT login_event_method_check
  CHECK (method IN ('register', 'password', 'face', 'passkey', 'oidc', 'totp', 'recovery'));
