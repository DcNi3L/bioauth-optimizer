'use client';

import type { MeasuredFactorsDto } from '@bioauth/contracts';

import { formatMs, formatPercent } from '@/shared/lib';
import { Notice } from '@/shared/ui';

/** Измеренные характеристики факторов: FRR и задержка — из журнала попыток, FAR — подтверждённый или заявленный. */
export function MeasuredFactors({ data }: { data: MeasuredFactorsDto }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="text-graphite text-left text-xs">
            <tr className="border-rule border-b">
              <th className="py-2 pr-3 font-normal">Фактор</th>
              <th className="py-2 pr-3 text-right font-normal">FAR</th>
              <th className="py-2 pr-3 text-right font-normal">FRR (95% интервал)</th>
              <th className="py-2 pr-3 text-right font-normal">Задержка p50 / p95</th>
              <th className="py-2 text-right font-normal">Попыток</th>
            </tr>
          </thead>
          <tbody>
            {data.factors.map((f) => (
              <tr key={f.code} className="border-rule border-b last:border-b-0">
                <td className="py-2 pr-3">{f.name}</td>
                <td className="num py-2 pr-3 text-right">
                  {formatPercent(f.far, 4)}{' '}
                  <span className="text-graphite text-xs">
                    {f.sources.far === 'measured' ? 'измерен' : 'заявлен'}
                  </span>
                </td>
                <td className="num py-2 pr-3 text-right">
                  {formatPercent(f.frr, 2)}{' '}
                  <span className="text-graphite text-xs">
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
        <p className="text-graphite text-sm">Попыток входа ещё нет — измерять нечего.</p>
      )}
      {data.warnings.map((w) => (
        <Notice key={w} tone="caution">
          {w}
        </Notice>
      ))}
    </div>
  );
}
