'use client';

import { useViewer } from '@/entities/viewer';
import { BatchForm, BatchJobs } from '@/features/admin/run-batch';
import { useT } from '@/shared/i18n';
import { Notice, Panel } from '@/shared/ui';

/** Пакетный режим (UC-9): открытые наборы изображений → тысячи impostor-сравнений для подтверждения малого FAR. */
export function AdminBatchPage() {
  const t = useT();
  const viewer = useViewer().data;
  if (viewer?.role !== 'admin' && viewer?.role !== 'researcher')
    return <Notice tone="info">{t('algo.batch.roleNotice')}</Notice>;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel title={t('algo.batch.archiveTitle')} description={t('algo.batch.archiveDesc')}>
        <div className="px-5 py-4">
          <BatchForm />
        </div>
      </Panel>
      <Panel title={t('algo.batch.jobsTitle')} description={t('algo.batch.jobsDesc')}>
        <div className="px-5 py-4">
          <BatchJobs />
        </div>
      </Panel>
    </div>
  );
}
