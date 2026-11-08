import type { AuthPolicyDto } from '@bioauth/contracts';

import type { TKey } from '@/shared/i18n';
import { useT } from '@/shared/i18n';

import { STATUS_TONE } from '../model/labels';

const STATUS_KEY: Record<AuthPolicyDto['status'], TKey> = {
  proposed: 'algo.policies.statusProposed',
  active: 'algo.policies.statusActive',
  retired: 'algo.policies.statusRetired',
  rejected: 'algo.policies.statusRejected',
};

export function PolicyStatus({ status }: { status: AuthPolicyDto['status'] }) {
  const t = useT();
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {t(STATUS_KEY[status])}
    </span>
  );
}
