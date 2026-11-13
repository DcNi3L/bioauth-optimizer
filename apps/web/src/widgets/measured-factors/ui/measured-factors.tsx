'use client';

import type { MeasuredFactorsDto } from '@bioauth/contracts';

import { useT } from '@/shared/i18n';
import { formatMs, formatPercent } from '@/shared/lib';
import { Notice } from '@/shared/ui';

/** Измеренные характеристики факторов: FRR и задержка — из журнала попыток, FAR — подтверждённый или заявленный. */
export function MeasuredFactors({ data }: { data: MeasuredFactorsDto }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-160 text-sm">
          <thead className="text-left text-xs text-graphite">
            <tr className="border-b border-rule">
              <th className="py-2 pr-3 font-normal">{t('algo.measurements.factorCol')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.measurements.farCol')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.measurements.frrCol')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.measurements.latencyCol')}</th>
              <th className="py-2 text-right font-normal">{t('algo.measurements.attemptsCol')}</th>
            </tr>
          </thead>
          <tbody>
            {data.factors.map((f) => (
              <tr key={f.code} className="border-b border-rule last:border-b-0">
                <td className="py-2 pr-3">{f.name}</td>
                <td className="num py-2 pr-3 text-right">
                  {formatPercent(f.far, 4)}{' '}
                  <span className="text-xs text-graphite">
                    {f.sources.far === 'measured'
                      ? t('algo.measurements.measured')
                      : t('algo.measurements.claimed')}
                  </span>
                </td>
                <td className="num py-2 pr-3 text-right">
                  {formatPercent(f.frr, 2)}{' '}
                  <span className="text-xs text-graphite">
                    ({formatPercent(f.frrInterval[0], 1)} … {formatPercent(f.frrInterval[1], 1)})
                  </span>
                </td>
                <td className="num py-2 pr-3 text-right">
                  {formatMs(f.latencyMs)} / {f.latencyP95Ms === null ? '—' : formatMs(f.latencyP95Ms)}
                </td>
                <td className="num py-2 text-right">{f.attempts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.factors.length === 0 && (
        <p className="text-sm text-graphite">{t('algo.measurements.factorsEmpty')}</p>
      )}
      {data.warnings.map((w) => (
        <Notice key={w} tone="caution">
          {w}
        </Notice>
      ))}
    </div>
  );
}
