-- Шаги политики входа «код из приложения» и «ритм набора» (#48).
ALTER TABLE auth_attempt DROP CONSTRAINT auth_attempt_factor_check;
ALTER TABLE auth_attempt
  ADD CONSTRAINT auth_attempt_factor_check CHECK (factor IN ('face', 'passkey', 'totp', 'keystroke'));

-- Оценки ритма набора (1 − d/4) копятся для калибровки τ_kd так же, как оценки лица.
ALTER TABLE score_sample DROP CONSTRAINT score_sample_modality_check;
ALTER TABLE score_sample
  ADD CONSTRAINT score_sample_modality_check CHECK (modality IN ('face', 'fingerprint', 'pad', 'keystroke'));

ALTER TABLE login_event DROP CONSTRAINT login_event_method_check;
ALTER TABLE login_event
  ADD CONSTRAINT login_event_method_check
  CHECK (method IN ('register', 'password', 'face', 'passkey', 'oidc', 'totp', 'recovery', 'keystroke'));
