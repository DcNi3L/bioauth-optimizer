-- Вход на компьютере с подтверждением на телефоне по QR-коду (#40).
CREATE TABLE cross_device_request (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- sha256 секретов: опроса (остаётся на компьютере) и подтверждения (в QR-коде).
  poll_hash      text NOT NULL,
  approve_hash   text NOT NULL,
  -- Число, которое человек выбирает на телефоне из трёх: подтверждает, что видит именно этот компьютер.
  match_number   smallint NOT NULL CHECK (match_number BETWEEN 10 AND 99),
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'approved', 'denied', 'consumed')),
  user_id        uuid REFERENCES app_user (id) ON DELETE CASCADE,
  amr            text[] NOT NULL DEFAULT '{}',
  mfa            boolean NOT NULL DEFAULT false,
  ip             text,
  user_agent     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,
  decided_at     timestamptz,
  CONSTRAINT cross_device_approved_user CHECK (status IN ('pending', 'denied') OR user_id IS NOT NULL)
);
CREATE INDEX cross_device_request_expires_idx ON cross_device_request (expires_at);

ALTER TABLE login_event DROP CONSTRAINT login_event_method_check;
ALTER TABLE login_event
  ADD CONSTRAINT login_event_method_check
  CHECK (method IN ('register', 'password', 'face', 'passkey', 'oidc', 'totp', 'recovery', 'keystroke', 'cross_device'));
