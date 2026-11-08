'use client';

import { useT } from '@/shared/i18n';
import { downloadCsv, downloadDataUrl, downloadJson } from '@/shared/lib';
import { Button } from '@/shared/ui';

export interface ExportSpec {
  readonly baseName: string;
  readonly json: unknown;
  readonly csv?: { header: string[]; rows: (string | number | null)[][] };
  readonly png?: () => string | null;
}

/** Экспорт результата: JSON (полный ответ), CSV (таблица), PNG (график). */
export function ExportButtons({ spec }: { spec: ExportSpec }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <span className="text-graphite">{t('algo.chrome.download')}</span>
      <Button variant="ghost" onClick={() => downloadJson(`${spec.baseName}.json`, spec.json)}>
        JSON
      </Button>
      {spec.csv && (
        <Button
          variant="ghost"
          onClick={() => downloadCsv(`${spec.baseName}.csv`, spec.csv!.header, spec.csv!.rows)}
        >
          CSV
        </Button>
      )}
      {spec.png && (
        <Button
          variant="ghost"
          onClick={() => {
            const url = spec.png!();
            if (url) downloadDataUrl(`${spec.baseName}.png`, url);
          }}
        >
          {t('algo.chrome.png')}
        </Button>
      )}
    </div>
  );
}
