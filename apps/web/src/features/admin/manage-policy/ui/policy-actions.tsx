'use client';

import type { AuthPolicyDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

import { usePolicyDecision } from '../api/policy';

/** Решение по политике: утвердить, отклонить, откатиться к ранее действовавшей версии. Комментарий — в журнал аудита. */
export function PolicyActions({ policy }: { policy: AuthPolicyDto }) {
  const t = useT();
  const decide = usePolicyDecision();
  const [note, setNote] = useState('');
  if (policy.status === 'active' || policy.status === 'rejected') return null;
  const act = (action: 'approve' | 'reject' | 'rollback') =>
    decide.mutate({ id: policy.id, action, note: note.trim() || null });
  return (
    <div className="flex flex-col gap-2">
      <TextField
        label={t('algo.policies.noteLabel')}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex flex-wrap gap-2">
        {policy.status === 'proposed' ? (
          <>
            <Button busy={decide.isPending} onClick={() => act('approve')}>
              {t('algo.policies.approve', { n: policy.version })}
            </Button>
            <Button variant="secondary" disabled={decide.isPending} onClick={() => act('reject')}>
              {t('algo.policies.reject')}
            </Button>
          </>
        ) : (
          <Button variant="secondary" busy={decide.isPending} onClick={() => act('rollback')}>
            {t('algo.policies.rollback', { n: policy.version })}
          </Button>
        )}
      </div>
      <ApiErrorNotice error={decide.error} />
    </div>
  );
}
