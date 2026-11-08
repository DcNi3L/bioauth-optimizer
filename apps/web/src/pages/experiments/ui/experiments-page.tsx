'use client';

import { useT } from '@/shared/i18n';
import { Panel } from '@/shared/ui';
import { ExperimentsTable } from '@/widgets/experiments-table';

export function ExperimentsPage() {
  const t = useT();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl">{t('algo.history.title')}</h2>
        <p className="text-graphite mt-1 max-w-prose text-sm">{t('algo.history.subtitle')}</p>
      </div>
      <Panel>
        <ExperimentsTable />
      </Panel>
    </div>
  );
}
