'use client';

import type { AuthPolicyDto } from '@bioauth/contracts';
import { useState } from 'react';

import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

import { usePolicyDecision } from '../api/policy';

/** Решение по политике: утвердить, отклонить, откатиться к ранее действовавшей версии. Комментарий — в журнал аудита. */
export function PolicyActions({ policy }: { policy: AuthPolicyDto }) {
  const decide = usePolicyDecision();
  const [note, setNote] = useState('');
  if (policy.status === 'active' || policy.status === 'rejected') return null;
  const act = (action: 'approve' | 'reject' | 'rollback') =>
    decide.mutate({ id: policy.id, action, note: note.trim() || null });
  return (
    <div className="flex flex-col gap-2">
      <TextField label="Комментарий к решению" value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap gap-2">
        {policy.status === 'proposed' ? (
          <>
            <Button busy={decide.isPending} onClick={() => act('approve')}>
              Утвердить v{policy.version}
            </Button>
            <Button variant="secondary" disabled={decide.isPending} onClick={() => act('reject')}>
              Отклонить
            </Button>
          </>
        ) : (
          <Button variant="secondary" busy={decide.isPending} onClick={() => act('rollback')}>
            Вернуть v{policy.version}
          </Button>
        )}
      </div>
      <ApiErrorNotice error={decide.error} />
    </div>
  );
}
