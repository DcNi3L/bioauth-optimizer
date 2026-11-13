-- Повторное подтверждение для опасных действий (#41): когда в этой сессии последний раз подтверждён второй фактор.
ALTER TABLE user_session ADD COLUMN mfa_verified_at timestamptz;

-- Действующие сессии, получившие второй фактор, считаются подтверждёнными в момент входа.
UPDATE user_session SET mfa_verified_at = created_at WHERE mfa_complete AND 'mfa' = ANY (amr);
