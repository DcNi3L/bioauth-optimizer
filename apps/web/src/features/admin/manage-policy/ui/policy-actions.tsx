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
  // Откат — редкое действие: поле комментария и подтверждение появляются только после нажатия.
  const [confirming, setConfirming] = useState(false);
  if (policy.status === 'active' || policy.status === 'rejected') return null;
  const act = (action: 'approve' | 'reject' | 'rollback') =>
    decide.mutate({ id: policy.id, action, note: note.trim() || null });
  const noteField = (
    <TextField label={t('algo.policies.noteLabel')} value={note} onChange={(e) => setNote(e.target.value)} />
  );
  if (policy.status !== 'proposed') {
    return confirming ? (
      <div className="flex flex-col gap-2">
        {noteField}
        <div className="flex flex-wrap gap-2">
          <Button busy={decide.isPending} onClick={() => act('rollback')}>
            {t('algo.policies.rollback', { n: policy.version })}
          </Button>
          <Button variant="secondary" disabled={decide.isPending} onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
        <ApiErrorNotice error={decide.error} />
      </div>
    ) : (
      <Button variant="secondary" size="sm" onClick={() => setConfirming(true)}>
        {t('algo.policies.rollback', { n: policy.version })}…
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      {noteField}
      <div className="flex flex-wrap gap-2">
        <Button busy={decide.isPending} onClick={() => act('approve')}>
          {t('algo.policies.approve', { n: policy.version })}
        </Button>
        <Button variant="secondary" disabled={decide.isPending} onClick={() => act('reject')}>
          {t('algo.policies.reject')}
        </Button>
      </div>
      <ApiErrorNotice error={decide.error} />
    </div>
  );
}
