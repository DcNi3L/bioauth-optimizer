import type { ColumnType, Generated } from 'kysely';

/** Типы таблиц для Kysely; источник правды — SQL-миграции в apps/api/migrations. */
export interface FactorCatalogTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  is_preset: Generated<boolean>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export interface FactorTable {
  id: Generated<string>;
  catalog_id: string;
  code: string;
  name: string;
  far: number;
  frr: number;
  latency_ms: number;
  cost: number;
  has_pad: boolean;
  position: number;
}

export interface ScoreDatasetTable {
  id: Generated<string>;
  name: string;
  original_filename: string;
  genuine_count: number;
  impostor_count: number;
  genuine_scores: Buffer;
  impostor_scores: Buffer;
  sha256: string;
  created_at: ColumnType<Date, never, never>;
}

export type ExperimentTypeDb = 'THRESHOLD' | 'FACTOR_SELECTION' | 'BUDGET_SWEEP';
export type ExperimentStatusDb = 'OK' | 'INFEASIBLE';

export interface ExperimentTable {
  id: Generated<string>;
  type: ExperimentTypeDb;
  status: ExperimentStatusDb;
  input: ColumnType<unknown, string, never>;
  result: ColumnType<unknown, string, never>;
  input_hash: string;
  solver: string | null;
  core_version: string;
  duration_ms: number;
  factor_catalog_id: string | null;
  score_dataset_id: string | null;
  created_at: ColumnType<Date, never, never>;
}

// ── v2: пользователи и биометрия (миграция 0002) ──

export type RoleDb = 'subject' | 'admin' | 'researcher' | 'auditor';

export interface AppUserTable {
  id: Generated<string>;
  login: string;
  display_name: string;
  role: RoleDb;
  password_hash: string | null;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: ColumnType<Date, never, never>;
}

export interface UserSessionTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  mfa_complete: boolean;
  webauthn_challenge: string | null;
  created_at: ColumnType<Date, never, never>;
  expires_at: Date;
}

export interface ConsentTable {
  id: Generated<string>;
  user_id: string;
  text_version: string;
  granted_at: ColumnType<Date, never, never>;
  revoked_at: Date | null;
}

export interface FaceTemplateTable {
  user_id: string;
  ciphertext: Buffer;
  iv: Buffer;
  key_id: string;
  cancelable: boolean;
  model_version: string;
  samples: number;
  created_at: ColumnType<Date, never, never>;
  updated_at: Date;
}

export interface WebauthnCredentialTable {
  credential_id: string;
  user_id: string;
  public_key: Buffer;
  counter: ColumnType<string, number, number>;
  transports: string[];
  device_type: string;
  backed_up: boolean;
  created_at: ColumnType<Date, never, never>;
  last_used_at: Date | null;
}

export type PolicyStatusDb = 'proposed' | 'active' | 'retired' | 'rejected';

export interface AuthPolicyTable {
  id: Generated<string>;
  version: number;
  steps: ColumnType<unknown, string, string>;
  costs: ColumnType<unknown, string, string>;
  rationale: string | null;
  experiment_id: string | null;
  status: PolicyStatusDb;
  proposed_by: string | null;
  decided_by: string | null;
  decided_at: Date | null;
  decision_note: string | null;
  created_at: ColumnType<Date, never, never>;
}

export type AuthSessionStateDb = 'pending' | 'accepted' | 'rejected' | 'expired';

export interface AuthSessionTable {
  id: Generated<string>;
  user_id: string | null;
  policy_id: string;
  nonce: string;
  commands: string[];
  step_index: Generated<number>;
  failures: Generated<number>;
  state: AuthSessionStateDb;
  webauthn_challenge: string | null;
  face_accepted: Generated<boolean>;
  created_at: ColumnType<Date, never, never>;
  expires_at: Date;
  completed_at: Date | null;
}

export type FactorDb = 'face' | 'passkey';
export type AttemptOutcomeDb = 'accept' | 'reject' | 'error' | 'cancel';

export interface AuthAttemptTable {
  id: Generated<string>;
  user_id: string | null;
  policy_id: string | null;
  session_id: string | null;
  factor: FactorDb;
  outcome: AttemptOutcomeDb;
  score: number | null;
  liveness: number | null;
  challenges_ok: boolean | null;
  duration_ms: number;
  reject_reason: string | null;
  model_version: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export type ModalityDb = 'face' | 'fingerprint' | 'pad';
export type SampleKindDb = 'genuine' | 'impostor' | 'attack' | 'bonafide';
export type SampleSourceDb = 'enroll' | 'login' | 'cross' | 'pad_test' | 'batch';

export interface ScoreSampleTable {
  id: Generated<string>;
  attempt_id: string | null;
  user_id: string | null;
  modality: ModalityDb;
  kind: SampleKindDb;
  score: number;
  model_version: string;
  source: SampleSourceDb;
  attack_type: string | null;
  created_at: ColumnType<Date, Date | undefined, never>;
}

export interface Database {
  factor_catalog: FactorCatalogTable;
  factor: FactorTable;
  score_dataset: ScoreDatasetTable;
  experiment: ExperimentTable;
  app_user: AppUserTable;
  user_session: UserSessionTable;
  consent: ConsentTable;
  face_template: FaceTemplateTable;
  webauthn_credential: WebauthnCredentialTable;
  auth_policy: AuthPolicyTable;
  auth_session: AuthSessionTable;
  auth_attempt: AuthAttemptTable;
  score_sample: ScoreSampleTable;
  audit_event: AuditEventTable;
}

// ── Журнал аудита (миграция 0003) ──

export interface AuditEventTable {
  id: Generated<string>;
  seq: Generated<string>;
  at: ColumnType<Date, Date, never>;
  actor_id: string | null;
  action: string;
  target: string | null;
  details: ColumnType<unknown, string, never>;
  prev_hash: string;
  hash: string;
}
