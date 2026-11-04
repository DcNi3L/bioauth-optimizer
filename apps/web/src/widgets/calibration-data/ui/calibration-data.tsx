'use client';

import type { CalibrationDataDto } from '@bioauth/contracts';

import { formatDateTime } from '@/shared/lib';

const MODALITY = { face: 'Лицо (сходство)', pad: 'PAD («живость»)', fingerprint: 'Отпечаток' } as const;
const SOURCE: Record<string, string> = {
  enroll: 'регистрация',
  login: 'входы',
  cross: 'перекрёстные',
  pad_test: 'испытание PAD',
  batch: 'пакет',
};

const sourceLabel = (key: string) => {
  const [source = '', kind = ''] = key.split(':');
  return `${SOURCE[source] ?? source} · ${kind}`;
};

/** Накопленные оценки по модальностям и версиям моделей — сырьё для калибровки порогов. */
export function CalibrationData({ data }: { data: CalibrationDataDto[] }) {
  if (data.length === 0)
    return (
      <p className="text-graphite text-sm">
        Оценок пока нет: они появляются при регистрации лиц, входах и испытании PAD.
      </p>
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="text-graphite text-left text-xs">
          <tr className="border-rule border-b">
            <th className="py-2 pr-3 font-normal">Модальность</th>
            <th className="py-2 pr-3 font-normal">Версия модели</th>
            <th className="py-2 pr-3 text-right font-normal">Подлинных</th>
            <th className="py-2 pr-3 text-right font-normal">Ложных</th>
            <th className="py-2 pr-3 font-normal">Источники</th>
            <th className="py-2 font-normal">Последняя</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr
              key={`${d.modality}|${d.modelVersion}`}
              className="border-rule border-b align-top last:border-b-0"
            >
              <td className="py-2 pr-3">{MODALITY[d.modality]}</td>
              <td className="num break-all py-2 pr-3 text-xs">{d.modelVersion}</td>
              <td className="num py-2 pr-3 text-right">{d.positives}</td>
              <td className="num py-2 pr-3 text-right">{d.negatives}</td>
              <td className="text-graphite py-2 pr-3 text-xs">
                {Object.entries(d.bySource)
                  .map(([k, n]) => `${sourceLabel(k)}: ${n}`)
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
