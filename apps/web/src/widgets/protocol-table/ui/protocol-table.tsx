'use client';

import type { ProtocolReportDto } from '@bioauth/contracts';

import { downloadCsv, formatNumber, formatPercent } from '@/shared/lib';
import { Button } from '@/shared/ui';

const ci = (r: { rate: number | null; interval: [number, number] | null }) =>
  r.rate === null
    ? '—'
    : `${formatPercent(r.rate, 2)} [${formatPercent(r.interval![0], 2)}; ${formatPercent(r.interval![1], 2)}]`;

const csvCi = (r: { rate: number | null; interval: [number, number] | null }) =>
  r.rate === null ? [null, null, null] : [r.rate, r.interval![0], r.interval![1]];

/**
 * Таблица «до/после калибровки» (docs/10 §10.11) для защиты и статьи: одна выборка, разные пороги;
 * в скобках — 95%-интервалы Уилсона.
 */
export function ProtocolTable({ report }: { report: ProtocolReportDto }) {
  const rows = report.rows;
  const exportCsv = () =>
    downloadCsv(
      `protocol-${report.generatedAt.slice(0, 10)}.csv`,
      [
        'policy',
        'tau_face',
        'tau_pad',
        'FAR',
        'FAR_lo',
        'FAR_hi',
        'FAR_confirmed_95',
        'FRR',
        'FRR_lo',
        'FRR_hi',
        'E',
        'BPCER',
        'BPCER_lo',
        'BPCER_hi',
        'APCER_max',
        'genuine_n',
        'impostor_n',
        'cFA',
        'cFR',
        'model',
        'pad_model',
      ],
      rows.map((r) => [
        r.policyVersion,
        r.tauFace,
        r.tauPad,
        ...csvCi(r.far),
        r.confirmedFar,
        ...csvCi(r.frr),
        r.cost,
        ...csvCi(r.bpcer),
        r.apcerMax,
        report.sampleSizes.genuine,
        report.sampleSizes.impostor,
        report.costs.cFA,
        report.costs.cFR,
        report.modelVersion,
        report.padVersion,
      ]),
    );
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[52rem] text-sm">
          <thead className="text-graphite text-left text-xs">
            <tr className="border-rule border-b">
              <th className="py-2 pr-3 font-normal">Политика</th>
              <th className="py-2 pr-3 text-right font-normal">τ_face / τ_pad</th>
              <th className="py-2 pr-3 text-right font-normal">FAR [95% ДИ]</th>
              <th className="py-2 pr-3 text-right font-normal">FAR ≤ (95%)</th>
              <th className="py-2 pr-3 text-right font-normal">FRR [95% ДИ]</th>
              <th className="py-2 pr-3 text-right font-normal">E</th>
              <th className="py-2 pr-3 text-right font-normal">BPCER [95% ДИ]</th>
              <th className="py-2 text-right font-normal">APCER max</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.policyVersion} className="border-rule border-b last:border-b-0">
                <td className="py-2 pr-3">
                  v{r.policyVersion} {i === 0 ? '(до)' : i === rows.length - 1 ? '(после)' : ''}
                </td>
                <td className="num py-2 pr-3 text-right">
                  {formatNumber(r.tauFace, 4)} / {formatNumber(r.tauPad, 3)}
                </td>
                <td className="num text-far py-2 pr-3 text-right">{ci(r.far)}</td>
                <td className="num py-2 pr-3 text-right">{formatPercent(r.confirmedFar, 3)}</td>
                <td className="num text-frr py-2 pr-3 text-right">{ci(r.frr)}</td>
                <td className="num py-2 pr-3 text-right font-medium">{formatNumber(r.cost, 4)}</td>
                <td className="num py-2 pr-3 text-right">{ci(r.bpcer)}</td>
                <td className="num py-2 text-right">{formatPercent(r.apcerMax, 1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-graphite text-xs">
        Выборка: {report.sampleSizes.genuine} genuine и {report.sampleSizes.impostor} impostor-оценок модели{' '}
        <span className="num">{report.modelVersion ?? '—'}</span>; PAD —{' '}
        <span className="num">{report.padVersion ?? 'нет данных'}</span>. E = cFA·FAR + cFR·FRR при cFA ={' '}
        {formatNumber(report.costs.cFA)}, cFR = {formatNumber(report.costs.cFR)}.
      </p>
      <div>
        <Button variant="secondary" onClick={exportCsv}>
          Скачать CSV
        </Button>
      </div>
    </div>
  );
}
