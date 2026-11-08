'use client';

import { useState } from 'react';

import { usePadReport } from '@/entities/calibration';
import { useViewer } from '@/entities/viewer';
import { PadTestCapture } from '@/features/admin/run-pad-test';
import { useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Notice, NumberField, Panel } from '@/shared/ui';
import { PadReport } from '@/widgets/pad-report';

/** Испытание защиты от предъявления атак (UC-8) по протоколу docs/10 §10.11. */
export function AdminPadTestPage() {
  const t = useT();
  const viewer = useViewer().data;
  const [thresholdText, setThresholdText] = useState('');
  const parsed = parseNumber(thresholdText);
  const threshold = parsed !== null && parsed >= 0 && parsed <= 1 ? parsed : null;
  const report = usePadReport(threshold);
  const canRecord = viewer?.role === 'admin' || viewer?.role === 'researcher';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel title={t('algo.pad.captureTitle')} description={t('algo.pad.captureDesc')}>
        <div className="px-5 py-4">
          {canRecord ? <PadTestCapture /> : <Notice tone="info">{t('algo.pad.recordRole')}</Notice>}
        </div>
      </Panel>
      <Panel title={t('algo.pad.reportTitle')} description={t('algo.pad.reportDesc')}>
        <div className="flex flex-col gap-4 px-5 py-4">
          <NumberField
            label={t('algo.pad.thresholdLabel')}
            placeholder={t('algo.pad.thresholdPlaceholder')}
            value={thresholdText}
            onChange={(e) => setThresholdText(e.target.value)}
            hint={t('algo.pad.thresholdHint')}
            className="max-w-xs"
          />
          <ApiErrorNotice error={report.error} />
          {report.data && <PadReport report={report.data} />}
        </div>
      </Panel>
    </div>
  );
}
