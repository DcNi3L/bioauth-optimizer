'use client';

import type { CostsDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useProtocolReport } from '@/entities/calibration';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, NumberField, Panel } from '@/shared/ui';
import { ProtocolTable } from '@/widgets/protocol-table';

/** Отчёт протокола испытаний (§10.11): главный результат v2 для защиты и статьи. */
export function AdminReportPage() {
  const [costs, setCosts] = useState<CostsDto | null>(null);
  const [cFA, setCFA] = useState('');
  const [cFR, setCFR] = useState('');
  const report = useProtocolReport(costs);
  const fa = parseNumber(cFA);
  const fr = parseNumber(cFR);
  return (
    <Panel
      title="Протокол испытаний: до и после калибровки"
      description="Пороги исходной (v1) и действующей политики на одних и тех же накопленных оценках. Меняется только порог — поэтому разница в E показывает эффект калибровки."
    >
      <div className="flex flex-col gap-5 px-5 py-4">
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            className="w-36"
            label="cFA"
            placeholder="как в политике"
            value={cFA}
            onChange={(e) => setCFA(e.target.value)}
          />
          <NumberField
            className="w-36"
            label="cFR"
            placeholder="как в политике"
            value={cFR}
            onChange={(e) => setCFR(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!(fa !== null && fa > 0 && fr !== null && fr > 0)}
            onClick={() => setCosts({ cFA: fa!, cFR: fr! })}
          >
            Пересчитать E
          </Button>
          {costs && (
            <Button variant="ghost" onClick={() => setCosts(null)}>
              Стоимости политики
            </Button>
          )}
        </div>
        <ApiErrorNotice error={report.error} />
        {report.data && <ProtocolTable report={report.data} />}
      </div>
    </Panel>
  );
}
