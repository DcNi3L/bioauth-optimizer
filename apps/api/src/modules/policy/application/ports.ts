import type { AuthPolicyDto, CostsDto, PolicyStep } from '@bioauth/contracts';

export const POLICY_REPOSITORY = Symbol('POLICY_REPOSITORY');
export const POLICY_READER = Symbol('POLICY_READER');

export interface ActivePolicy {
  readonly id: string;
  readonly version: number;
  readonly steps: PolicyStep[];
  readonly costs: CostsDto;
}

/** Узкий порт для входа и регистрации: только активная политика. */
export interface PolicyReader {
  active(): Promise<ActivePolicy>;
  findById(id: string): Promise<ActivePolicy | null>;
}

export interface ProposePolicyData {
  readonly steps: PolicyStep[];
  readonly costs: CostsDto;
  readonly rationale: string | null;
  readonly experimentId: string | null;
  readonly proposedBy: string | null;
}

export interface PolicyRepository extends PolicyReader {
  list(): Promise<AuthPolicyDto[]>;
  get(id: string): Promise<AuthPolicyDto | null>;
  propose(data: ProposePolicyData): Promise<AuthPolicyDto>;
  /** Атомарно: текущая активная → retired, выбранная → active. false — политика не в допустимом статусе. */
  activate(
    id: string,
    decidedBy: string,
    note: string | null,
    from: readonly ('proposed' | 'retired')[],
  ): Promise<boolean>;
  reject(id: string, decidedBy: string, note: string | null): Promise<boolean>;
}
