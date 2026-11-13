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
  provenance: 'measured' | 'declared' | 'literature' | null;
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
  email: string | null;
  last_login_at: Date | null;
  disabled_at: Date | null;
}

export interface UserSessionTable {
  id: Generated<string>;
  user_id: string;
  token_hash: string;
  mfa_complete: boolean;
  webauthn_challenge: string | null;
  created_at: ColumnType<Date, never, never>;
  expires_at: Date;
  user_agent: string | null;
  ip: string | null;
  amr: Generated<string[]>;
  last_seen_at: Generated<Date>;
  mfa_verified_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
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

export interface UserTotpTable {
  user_id: string;
  secret_enc: Buffer;
  iv: Buffer;
  key_id: string;
  confirmed_at: Date | null;
  last_counter: ColumnType<string, number | string | undefined, number | string>;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: ColumnType<Date, never, never>;
}

export interface UserRecoveryCodeTable {
  id: Generated<string>;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: ColumnType<Date, never, never>;
}

export interface KeystrokeTemplateTable {
  user_id: string;
  ciphertext: Buffer;
  iv: Buffer;
  key_id: string;
  samples: number;
  phrase: string;
  failed_attempts: Generated<number>;
  locked_until: Date | null;
  created_at: ColumnType<Date, never, never>;
  updated_at: Generated<Date>;
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

export type FactorDb = 'face' | 'passkey' | 'totp' | 'keystroke';
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

export type ModalityDb = 'face' | 'fingerprint' | 'pad' | 'keystroke';
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
  login_event: LoginEventTable;
  cross_device_request: CrossDeviceRequestTable;
  user_avatar: UserAvatarTable;
  oauth_client: OauthClientTable;
  oauth_initial_token: OauthInitialTokenTable;
  tenant_settings: TenantSettingsTable;
  oauth_request: OauthRequestTable;
  oauth_code: OauthCodeTable;
  oauth_refresh_token: OauthRefreshTokenTable;
  oauth_consent: OauthConsentTable;
  oauth_signing_key: OauthSigningKeyTable;
  factor_catalog: FactorCatalogTable;
  factor: FactorTable;
  score_dataset: ScoreDatasetTable;
  experiment: ExperimentTable;
  app_user: AppUserTable;
  user_session: UserSessionTable;
  consent: ConsentTable;
  face_template: FaceTemplateTable;
  webauthn_credential: WebauthnCredentialTable;
  user_totp: UserTotpTable;
  user_recovery_code: UserRecoveryCodeTable;
  keystroke_template: KeystrokeTemplateTable;
  auth_policy: AuthPolicyTable;
  auth_session: AuthSessionTable;
  auth_attempt: AuthAttemptTable;
  score_sample: ScoreSampleTable;
  audit_event: AuditEventTable;
  drift_alert: DriftAlertTable;
}

export interface DriftAlertTable {
  id: Generated<string>;
  policy_id: string;
  model_version: string;
  window_start: Date;
  window_end: Date;
  baseline_frr: number;
  recent_frr: number;
  samples: number;
  z_score: number;
  acknowledged_by: string | null;
  acknowledged_at: Date | null;
  created_at: ColumnType<Date, never, never>;
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

// ── Учётные записи и OpenID Connect (миграция 0005) ──

export type LoginMethodDb =
  'register' | 'password' | 'face' | 'passkey' | 'oidc' | 'totp' | 'recovery' | 'keystroke' | 'cross_device';

export interface CrossDeviceRequestTable {
  id: Generated<string>;
  poll_hash: string;
  approve_hash: string;
  match_number: number;
  status: Generated<'pending' | 'approved' | 'denied' | 'consumed'>;
  user_id: string | null;
  amr: Generated<string[]>;
  mfa: Generated<boolean>;
  ip: string | null;
  user_agent: string | null;
  created_at: ColumnType<Date, never, never>;
  expires_at: Date;
  decided_at: Date | null;
}

export interface LoginEventTable {
  id: Generated<string>;
  user_id: string;
  at: Generated<Date>;
  success: boolean;
  method: LoginMethodDb;
  amr: Generated<string[]>;
  reason: string | null;
  user_agent: string | null;
  ip: string | null;
  client_id: string | null;
}

export interface UserAvatarTable {
  user_id: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  data: Buffer;
  updated_at: Generated<Date>;
}

export type GrantTypeDb = 'authorization_code' | 'refresh_token' | 'client_credentials';

export interface OauthClientTable {
  client_id: string;
  secret_hash: string | null;
  name: string;
  description: string | null;
  redirect_uris: string[];
  post_logout_redirect_uris: Generated<string[]>;
  grant_types: GrantTypeDb[];
  scopes: string[];
  first_party: Generated<boolean>;
  disabled: Generated<boolean>;
  pending_review: Generated<boolean>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface OauthInitialTokenTable {
  id: Generated<string>;
  token_hash: string;
  note: string | null;
  uses_left: number;
  expires_at: Date;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface TenantSettingsTable {
  id: Generated<boolean>;
  product_name: string;
  accent_color: string | null;
  logo_url: string | null;
  login_title: string | null;
  login_subtitle: string | null;
  support_url: string | null;
  privacy_url: string | null;
  terms_url: string | null;
  allow_signup: boolean;
  allow_cross_device: boolean;
  updated_at: Date | null;
  updated_by: string | null;
}

export interface OauthRequestTable {
  id: Generated<string>;
  client_id: string;
  params: ColumnType<unknown, string, string>;
  created_at: Generated<Date>;
  expires_at: Date;
}

export interface OauthCodeTable {
  code_hash: string;
  client_id: string;
  user_id: string;
  redirect_uri: string;
  scope: string[];
  code_challenge: string | null;
  nonce: string | null;
  auth_time: Date;
  amr: string[];
  expires_at: Date;
  used_at: Date | null;
}

export interface OauthRefreshTokenTable {
  token_hash: string;
  family: string;
  client_id: string;
  user_id: string;
  scope: string[];
  auth_time: Date;
  amr: string[];
  created_at: Generated<Date>;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface OauthConsentTable {
  user_id: string;
  client_id: string;
  scopes: string[];
  granted_at: Generated<Date>;
}

export interface OauthSigningKeyTable {
  kid: string;
  public_jwk: ColumnType<JsonWebKeyShape, string, string>;
  private_enc: Buffer;
  iv: Buffer;
  kek_id: string;
  active: Generated<boolean>;
  created_at: Generated<Date>;
}

export interface JsonWebKeyShape {
  kty: string;
  n: string;
  e: string;
  kid?: string;
  alg?: string;
  use?: string;
}
