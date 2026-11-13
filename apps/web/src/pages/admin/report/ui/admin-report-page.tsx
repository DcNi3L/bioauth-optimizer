'use client';

import type { CostsDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useProtocolReport } from '@/entities/calibration';
import { useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, NumberField, Panel } from '@/shared/ui';
import { ProtocolTable } from '@/widgets/protocol-table';

/** Отчёт протокола испытаний (§10.11): главный результат v2 для защиты и статьи. */
export function AdminReportPage() {
  const t = useT();
  const [costs, setCosts] = useState<CostsDto | null>(null);
  const [cFA, setCFA] = useState('');
  const [cFR, setCFR] = useState('');
  const report = useProtocolReport(costs);
  const fa = parseNumber(cFA);
  const fr = parseNumber(cFR);
  return (
    <Panel title={t('algo.protocol.title')} description={t('algo.protocol.desc')}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end gap-3">
          <NumberField
            className="w-36"
            label="cFA"
            placeholder={t('algo.protocol.asPolicy')}
            value={cFA}
            onChange={(e) => setCFA(e.target.value)}
          />
          <NumberField
            className="w-36"
            label="cFR"
            placeholder={t('algo.protocol.asPolicy')}
            value={cFR}
            onChange={(e) => setCFR(e.target.value)}
          />
          <Button
            variant="secondary"
            disabled={!(fa !== null && fa > 0 && fr !== null && fr > 0)}
            onClick={() => setCosts({ cFA: fa!, cFR: fr! })}
          >
            {t('algo.protocol.recompute')}
          </Button>
          {costs && (
            <Button variant="ghost" onClick={() => setCosts(null)}>
              {t('algo.protocol.policyCosts')}
            </Button>
          )}
        </div>
        <ApiErrorNotice error={report.error} />
        {report.data && <ProtocolTable report={report.data} />}
      </div>
    </Panel>
  );
}
