import { canonicalJson, sha256Hex } from '../../../shared/canonical-json';

export const AUDIT_LOG = Symbol('AUDIT_LOG');

/** Действия журнала аудита: сбор, хранение и уничтожение биометрии, изменения политик, входы сотрудников. */
export type AuditAction =
  | 'consent.granted'
  | 'consent.revoked'
  | 'face.enrolled'
  | 'face.deleted'
  | 'passkey.registered'
  | 'passkey.deleted'
  | 'policy.proposed'
  | 'policy.approved'
  | 'policy.rejected'
  | 'policy.rolled_back'
  | 'user.locked'
  | 'staff.login'
  | 'subject.registered'
  | 'templates.rekeyed'
  | 'pad_test.recorded'
  | 'face.enroll_failed'
  | 'batch.scored';

export interface AuditEventInput {
  readonly actorId: string | null;
  readonly action: AuditAction;
  readonly target?: string | null;
  readonly details?: Record<string, unknown>;
}

export interface AuditEventView {
  readonly seq: number;
  readonly at: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly target: string | null;
  readonly details: Record<string, unknown>;
  readonly hash: string;
}

export interface ChainVerification {
  readonly ok: boolean;
  readonly events: number;
  /** Номер первой записи, на которой цепочка разорвана. */
  readonly brokenAt: number | null;
}

export interface AuditLog {
  record(event: AuditEventInput): Promise<void>;
  list(limit: number, beforeSeq?: number): Promise<AuditEventView[]>;
  verify(): Promise<ChainVerification>;
}

export const GENESIS_HASH = '0'.repeat(64);

/** hash = sha256(prev_hash || канонический JSON события). Время входит в хэш с точностью до миллисекунды. */
export function chainHash(
  prevHash: string,
  e: { at: Date; actorId: string | null; action: string; target: string | null; details: unknown },
): string {
  return sha256Hex(
    prevHash +
      canonicalJson({
        at: e.at.toISOString(),
        actorId: e.actorId,
        action: e.action,
        target: e.target,
        details: e.details,
      }),
  );
}
