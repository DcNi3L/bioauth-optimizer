import type { AuthPolicyDto } from '@bioauth/contracts';

import { STATUS_LABELS, STATUS_TONE } from '../model/labels';

export function PolicyStatus({ status }: { status: AuthPolicyDto['status'] }) {
  return (
    <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_TONE[status]}`}>
      {STATUS_LABELS[status]}
    </span>
  );
}
