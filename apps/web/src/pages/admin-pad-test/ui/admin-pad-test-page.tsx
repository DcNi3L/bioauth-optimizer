'use client';

import { useState } from 'react';

import { usePadReport } from '@/entities/calibration';
import { useViewer } from '@/entities/viewer';
import { PadTestCapture } from '@/features/run-pad-test';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Notice, NumberField, Panel } from '@/shared/ui';
import { PadReport } from '@/widgets/pad-report';

/** Испытание защиты от предъявления атак (UC-8) по протоколу docs/10 §10.11. */
export function AdminPadTestPage() {
  const viewer = useViewer().data;
  const [thresholdText, setThresholdText] = useState('');
  const t = parseNumber(thresholdText);
  const threshold = t !== null && t >= 0 && t <= 1 ? t : null;
  const report = usePadReport(threshold);
  const canRecord = viewer?.role === 'admin' || viewer?.role === 'researcher';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel
        title="Запись предъявлений"
        description="Участники испытания дают согласие; изображения не сохраняются — только p_live и метка."
      >
        <div className="px-5 py-4">
          {canRecord ? (
            <PadTestCapture />
          ) : (
            <Notice tone="info">Записывают предъявления администратор и исследователь.</Notice>
          )}
        </div>
      </Panel>
      <Panel
        title="Отчёт APCER / BPCER"
        description="ISO/IEC 30107-3: доля пропущенных атак по виду и доля отклонённых подлинных предъявлений."
      >
        <div className="flex flex-col gap-4 px-5 py-4">
          <NumberField
            label="Порог для отчёта"
            placeholder="по действующей политике"
            value={thresholdText}
            onChange={(e) => setThresholdText(e.target.value)}
            hint="Пусто — порог τ_pad действующей политики"
            className="max-w-xs"
          />
          <ApiErrorNotice error={report.error} />
          {report.data && <PadReport report={report.data} />}
        </div>
      </Panel>
    </div>
  );
}
