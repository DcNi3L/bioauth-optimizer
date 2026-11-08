'use client';

import type { CalibrationDataDto } from '@bioauth/contracts';

import type { TFn, TKey } from '@/shared/i18n';
import { useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';

const MODALITY: Record<CalibrationDataDto['modality'], TKey> = {
  face: 'algo.measurements.modalityFace',
  pad: 'algo.measurements.modalityPad',
  fingerprint: 'algo.measurements.modalityFingerprint',
};

const SOURCE: Record<string, TKey> = {
  enroll: 'algo.measurements.sourceEnroll',
  login: 'algo.measurements.sourceLogin',
  cross: 'algo.measurements.sourceCross',
  pad_test: 'algo.measurements.sourcePad',
  batch: 'algo.measurements.sourceBatch',
};

const sourceLabel = (t: TFn, key: string) => {
  const [source = '', kind = ''] = key.split(':');
  const name = SOURCE[source];
  return `${name ? t(name) : source} · ${kind}`;
};

/** Накопленные оценки по модальностям и версиям моделей — сырьё для калибровки порогов. */
export function CalibrationData({ data }: { data: CalibrationDataDto[] }) {
  const t = useT();
  if (data.length === 0) return <p className="text-graphite text-sm">{t('algo.measurements.scoresEmpty')}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="min-w-160 w-full text-sm">
        <thead className="text-graphite text-left text-xs">
          <tr className="border-rule border-b">
            <th className="py-2 pr-3 font-normal">{t('algo.measurements.colModality')}</th>
            <th className="py-2 pr-3 font-normal">{t('algo.measurements.colModel')}</th>
            <th className="py-2 pr-3 text-right font-normal">{t('algo.measurements.colGenuine')}</th>
            <th className="py-2 pr-3 text-right font-normal">{t('algo.measurements.colImpostor')}</th>
            <th className="py-2 pr-3 font-normal">{t('algo.measurements.colSources')}</th>
            <th className="py-2 font-normal">{t('algo.measurements.colLast')}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr
              key={`${d.modality}|${d.modelVersion}`}
              className="border-rule border-b align-top last:border-b-0"
            >
              <td className="py-2 pr-3">{t(MODALITY[d.modality])}</td>
              <td className="num break-all py-2 pr-3 text-xs">{d.modelVersion}</td>
              <td className="num py-2 pr-3 text-right">{d.positives}</td>
              <td className="num py-2 pr-3 text-right">{d.negatives}</td>
              <td className="text-graphite py-2 pr-3 text-xs">
                {Object.entries(d.bySource)
                  .map(([k, n]) => `${sourceLabel(t, k)}: ${n}`)
                  .join(', ')}
              </td>
              <td className="num whitespace-nowrap py-2 text-xs">
                {d.lastAt ? formatDateTime(d.lastAt) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
