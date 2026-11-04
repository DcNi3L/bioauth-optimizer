'use client';

import type { PadReportDto } from '@bioauth/contracts';

import { formatPercent } from '@/shared/lib';
import { Metric } from '@/shared/ui';

const ATTACK = {
  print: 'Печатное фото',
  screen: 'Фото на экране',
  video: 'Видео на экране',
  mask: 'Маска',
  other: 'Другое',
} as const;

const interval = (i: [number, number] | null) =>
  i ? `${formatPercent(i[0], 1)} … ${formatPercent(i[1], 1)}` : '—';

/** Отчёт ISO/IEC 30107-3: BPCER (отказ подлинным) и APCER по каждому виду атаки с 95%-интервалом Уилсона. */
export function PadReport({ report }: { report: PadReportDto }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Metric label="Порог τ_pad" value={report.threshold.toLocaleString('ru-RU')} />
        <Metric label="BPCER" value={formatPercent(report.bpcer.rate, 1)} tone="frr" />
        <Metric label="APCER (худшая атака)" value={formatPercent(report.apcerMax, 1)} tone="far" />
        <Metric label="Подлинных предъявлений" value={report.bpcer.total} />
      </div>
      <table className="w-full text-sm">
        <thead className="text-graphite text-left text-xs">
          <tr className="border-rule border-b">
            <th className="py-2 pr-3 font-normal">Вид атаки</th>
            <th className="py-2 pr-3 text-right font-normal">Пропущено / всего</th>
            <th className="py-2 pr-3 text-right font-normal">APCER</th>
            <th className="py-2 text-right font-normal">95% интервал</th>
          </tr>
        </thead>
        <tbody>
          {report.apcer.map((a) => (
            <tr key={a.attackType} className="border-rule border-b last:border-b-0">
              <td className="py-2 pr-3">{ATTACK[a.attackType]}</td>
              <td className="num py-2 pr-3 text-right">
                {a.errors} / {a.total}
              </td>
              <td className="num py-2 pr-3 text-right">{formatPercent(a.rate, 1)}</td>
              <td className="num py-2 text-right">{interval(a.interval)}</td>
            </tr>
          ))}
          <tr>
            <td className="py-2 pr-3">Подлинные (BPCER)</td>
            <td className="num py-2 pr-3 text-right">
              {report.bpcer.errors} / {report.bpcer.total}
            </td>
            <td className="num py-2 pr-3 text-right">{formatPercent(report.bpcer.rate, 1)}</td>
            <td className="num py-2 text-right">{interval(report.bpcer.interval)}</td>
          </tr>
        </tbody>
      </table>
      {report.apcer.length === 0 && <p className="text-graphite text-sm">Атак ещё не записано.</p>}
    </div>
  );
}
