'use client';

import { useT } from '@/shared/i18n';
import { Panel } from '@/shared/ui';
import { AttemptsTable } from '@/widgets/attempts-table';

export function AdminAttemptsPage() {
  const t = useT();
  return (
    <Panel title={t('algo.attempts.title')} description={t('algo.attempts.desc')}>
      <div>
        <AttemptsTable />
      </div>
    </Panel>
  );
}
