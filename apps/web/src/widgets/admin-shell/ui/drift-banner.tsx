'use client';

import type { DriftAlertDto } from '@bioauth/contracts';

import { AcknowledgeDriftButton } from '@/features/admin/acknowledge-drift';
import { useT } from '@/shared/i18n';
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
  const t = useT();
  if (alerts.length === 0) return null;
  return (
    <Notice tone="caution" title={t('drift.title')}>
      <ul className="flex flex-col gap-1">
        {alerts.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3">
            <span className="num">
              {t('drift.text', {
                v: a.policyVersion,
                m: a.modelVersion,
                from: formatPercent(a.baselineFrr, 2),
                to: formatPercent(a.recentFrr, 2),
                n: a.samples,
                z: formatNumber(a.zScore, 2),
                date: formatDateTime(a.windowEnd),
              })}
            </span>
            {canAcknowledge && <AcknowledgeDriftButton id={a.id} />}
          </li>
        ))}
      </ul>
    </Notice>
  );
}
