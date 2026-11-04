-- Журнал аудита с цепочкой хэшей (docs/10 §10.9–10.10): append-only.
-- hash = sha256(prev_hash || канонический JSON события); вставки сериализуются advisory-блокировкой в приложении.
-- actor_id без внешнего ключа: удаление пользователя не должно менять записи журнала.

CREATE TABLE audit_event (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq       bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  at        timestamptz NOT NULL,
  actor_id  uuid,
  action    text NOT NULL CHECK (action ~ '^[a-z][a-z_.]{2,63}$'),
  target    text,
  details   jsonb NOT NULL DEFAULT '{}'::jsonb,
  prev_hash char(64) NOT NULL CHECK (prev_hash ~ '^[0-9a-f]{64}$'),
  hash      char(64) NOT NULL UNIQUE CHECK (hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX audit_event_at_idx ON audit_event (at DESC);

CREATE FUNCTION audit_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_event: журнал аудита только дополняется (%)', TG_OP;
END;
$$;

CREATE TRIGGER audit_event_no_update BEFORE UPDATE OR DELETE ON audit_event
  FOR EACH ROW EXECUTE FUNCTION audit_event_immutable();
CREATE TRIGGER audit_event_no_truncate BEFORE TRUNCATE ON audit_event
  FOR EACH STATEMENT EXECUTE FUNCTION audit_event_immutable();

REVOKE UPDATE, DELETE, TRUNCATE ON audit_event FROM PUBLIC;
