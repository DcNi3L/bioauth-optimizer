-- v2.2: происхождение параметров факторов (измерено / заявлено / из литературы) и уведомления о дрейфе FRR.

ALTER TABLE factor ADD COLUMN provenance text CHECK (provenance IN ('measured', 'declared', 'literature'));

CREATE TABLE drift_alert (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id      uuid NOT NULL REFERENCES auth_policy(id) ON DELETE CASCADE,
  model_version  text NOT NULL,
  window_start   timestamptz NOT NULL,
  window_end     timestamptz NOT NULL,
  baseline_frr   double precision NOT NULL CHECK (baseline_frr BETWEEN 0 AND 1),
  recent_frr     double precision NOT NULL CHECK (recent_frr BETWEEN 0 AND 1),
  samples        integer NOT NULL CHECK (samples > 0),
  z_score        double precision NOT NULL,
  acknowledged_by uuid REFERENCES app_user(id) ON DELETE SET NULL,
  acknowledged_at timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start),
  -- проверка идемпотентна: не более одного уведомления на политику за окно
  UNIQUE (policy_id, window_end)
);
CREATE INDEX drift_alert_open_idx ON drift_alert (created_at DESC) WHERE acknowledged_at IS NULL;
