-- v3.3: динамика набора текста (поведенческая биометрия). Шаблон — среднее и разброс по повторам — хранится зашифрованным.
CREATE TABLE keystroke_template (
  user_id         uuid PRIMARY KEY REFERENCES app_user(id) ON DELETE CASCADE,
  ciphertext      bytea       NOT NULL CHECK (octet_length(ciphertext) BETWEEN 17 AND 8192),
  iv              bytea       NOT NULL CHECK (octet_length(iv) = 12),
  key_id          text        NOT NULL,
  samples         integer     NOT NULL CHECK (samples BETWEEN 2 AND 100),
  phrase          text        NOT NULL CHECK (phrase ~ '^[a-z ]{8,64}$'),
  failed_attempts integer     NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
