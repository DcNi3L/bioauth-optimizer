-- v3: учётные записи (сессии и устройства, история входов, аватар) и сервер авторизации OpenID Connect.

-- Сессии: устройство, адрес, способ входа (amr по RFC 8176) и последняя активность.
ALTER TABLE user_session
  ADD COLUMN user_agent   text CHECK (length(user_agent) <= 512),
  ADD COLUMN ip           text CHECK (length(ip) <= 64),
  ADD COLUMN amr          text[] NOT NULL DEFAULT '{}',
  ADD COLUMN last_seen_at timestamptz NOT NULL DEFAULT now();
DROP INDEX user_session_user_idx;
CREATE INDEX user_session_user_idx ON user_session (user_id, last_seen_at DESC);

ALTER TABLE app_user
  ADD COLUMN email         text CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' AND length(email) <= 254),
  ADD COLUMN last_login_at timestamptz,
  ADD COLUMN disabled_at   timestamptz;
CREATE UNIQUE INDEX app_user_email_idx ON app_user (lower(email)) WHERE email IS NOT NULL;

-- История входов: и успешные, и отклонённые (по известному пользователю).
CREATE TABLE login_event (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  at         timestamptz NOT NULL DEFAULT now(),
  success    boolean NOT NULL,
  method     text NOT NULL CHECK (method IN ('register', 'password', 'face', 'passkey', 'oidc')),
  amr        text[] NOT NULL DEFAULT '{}',
  reason     text,
  user_agent text CHECK (length(user_agent) <= 512),
  ip         text CHECK (length(ip) <= 64),
  client_id  text
);
CREATE INDEX login_event_user_idx ON login_event (user_id, at DESC);
CREATE INDEX login_event_at_idx ON login_event (at DESC);

-- Аватар: небольшое изображение (PNG, JPEG, WebP) прямо в БД.
CREATE TABLE user_avatar (
  user_id    uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  mime       text NOT NULL CHECK (mime IN ('image/png', 'image/jpeg', 'image/webp')),
  data       bytea NOT NULL CHECK (octet_length(data) BETWEEN 64 AND 1048576),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── OpenID Connect ──

CREATE TABLE oauth_client (
  client_id      text PRIMARY KEY CHECK (client_id ~ '^[A-Za-z0-9._-]{3,64}$'),
  secret_hash    text,                                   -- NULL — публичный клиент (только PKCE)
  name           text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  description    text CHECK (length(description) <= 500),
  redirect_uris  text[] NOT NULL,
  post_logout_redirect_uris text[] NOT NULL DEFAULT '{}',
  grant_types    text[] NOT NULL,
  scopes         text[] NOT NULL,
  first_party    boolean NOT NULL DEFAULT false,         -- согласие не запрашивается
  disabled       boolean NOT NULL DEFAULT false,
  created_by     uuid REFERENCES app_user(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (grant_types <@ ARRAY['authorization_code', 'refresh_token', 'client_credentials']::text[]),
  CHECK (NOT ('client_credentials' = ANY (grant_types)) OR secret_hash IS NOT NULL)
);

-- Незавершённый запрос авторизации: ждёт входа или согласия пользователя.
CREATE TABLE oauth_request (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id  text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  params     jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE oauth_code (
  code_hash      char(64) PRIMARY KEY,
  client_id      text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  user_id        uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  redirect_uri   text NOT NULL,
  scope          text[] NOT NULL,
  code_challenge text,
  nonce          text,
  auth_time      timestamptz NOT NULL,
  amr            text[] NOT NULL DEFAULT '{}',
  expires_at     timestamptz NOT NULL,
  used_at        timestamptz
);

-- Refresh-токены с ротацией: повторное использование отозванного токена отзывает всю цепочку (family).
CREATE TABLE oauth_refresh_token (
  token_hash char(64) PRIMARY KEY,
  family     uuid NOT NULL,
  client_id  text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  scope      text[] NOT NULL,
  auth_time  timestamptz NOT NULL,
  amr        text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz
);
CREATE INDEX oauth_refresh_family_idx ON oauth_refresh_token (family);
CREATE INDEX oauth_refresh_user_idx ON oauth_refresh_token (user_id, client_id);

CREATE TABLE oauth_consent (
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  client_id  text NOT NULL REFERENCES oauth_client(client_id) ON DELETE CASCADE,
  scopes     text[] NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, client_id)
);

-- Ключи подписи токенов (RS256). Закрытый ключ хранится зашифрованным (AES-256-GCM).
CREATE TABLE oauth_signing_key (
  kid         text PRIMARY KEY,
  public_jwk  jsonb NOT NULL,
  private_enc bytea NOT NULL,
  iv          bytea NOT NULL CHECK (octet_length(iv) = 12),
  kek_id      text NOT NULL,                          -- ключ шифрования (из TEMPLATE_KEYS)
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX oauth_signing_key_active_idx ON oauth_signing_key ((true)) WHERE active;
