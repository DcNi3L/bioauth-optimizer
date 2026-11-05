'use client';

import type { DriftAlertDto } from '@bioauth/contracts';

import { AcknowledgeDriftButton } from '@/features/admin/acknowledge-drift';
import { formatDateTime, formatNumber, formatPercent } from '@/shared/lib';
import { Notice } from '@/shared/ui';

/** Дрейф FRR (биномиальный z > 2 за окно): повод перекалибровать порог. Принять к сведению может только admin. */
export function DriftBanner({
  alerts,
  canAcknowledge,
}: {
  alerts: DriftAlertDto[];
  canAcknowledge: boolean;
}) {
  if (alerts.length === 0) return null;
  return (
    <Notice tone="caution" title="Обнаружен дрейф доли ложных отказов">
      <ul className="flex flex-col gap-1">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3">
            <span>
              Политика v{a.policyVersion}, модель <span className="num">{a.modelVersion}</span>: FRR{' '}
              <span className="num">{formatPercent(a.baselineFrr, 2)}</span> →{' '}
              <span className="num">{formatPercent(a.recentFrr, 2)}</span> на {a.samples} попытках (z ={' '}
              <span className="num">{formatNumber(a.zScore, 2)}</span>), окно до {formatDateTime(a.windowEnd)}
              .
            </span>
            {canAcknowledge && <AcknowledgeDriftButton id={a.id} />}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
