import type { CostsDto } from '@bioauth/contracts';

import { confirmedRate, wilson } from './stats';

/**
 * Протокол «до/после калибровки» на отложенной выборке (docs/10 §10.11, issue #31). Порог подбирается на одной
 * половине людей, а ошибки считаются на другой: так снимается оптимизм оценки «подобрали и проверили на одном».
 * Допуск — при оценке s ≥ τ (для ритма набора оценка 1 − d/4, т. е. d ≤ τ_kd).
 */

export interface RateWithInterval {
  readonly errors: number;
  readonly total: number;
  readonly rate: number | null;
  readonly interval: readonly [number, number] | null;
}

export interface HoldoutRow {
  readonly modality: 'face' | 'keystroke';
  readonly label: string;
  /** Порог в единицах политики: сходство для лица, расстояние для ритма. */
  readonly tau: number;
  readonly far: RateWithInterval;
  readonly frr: RateWithInterval;
  /** Верхняя 95%-граница FAR (правило трёх при нуле ложных допусков). */
  readonly confirmedFar: number | null;
  readonly cost: number | null;
  /** Порог подставлен в политику (для ритма набора — не всегда, см. ADR-0027). */
  readonly applied: boolean;
}

export interface HoldoutReport {
  readonly generatedAt: string;
  readonly costs: CostsDto;
  readonly targetFar: number;
  readonly policy: { readonly before: number | null; readonly after: number | null };
  readonly datasets: readonly {
    readonly modality: 'face' | 'keystroke';
    readonly name: string;
    readonly citation: string;
    readonly calibrationSubjects: number;
    readonly testSubjects: number;
    readonly testGenuine: number;
    readonly testImpostor: number;
    readonly calibrationExperimentId: string | null;
    readonly testDatasetId: string | null;
  }[];
  readonly rows: readonly HoldoutRow[];
}

const rate = (k: number, n: number): RateWithInterval => ({
  errors: k,
  total: n,
  rate: n ? k / n : null,
  interval: n ? wilson(k, n) : null,
});

/** Ошибки при пороге по оценкам (допуск s ≥ scoreTau) и ожидаемые потери E = cFA·FAR + cFR·FRR. */
export function evaluateAt(
  genuine: Iterable<number> & ArrayLike<number>,
  impostor: Iterable<number> & ArrayLike<number>,
  scoreTau: number,
  costs: CostsDto,
): Pick<HoldoutRow, 'far' | 'frr' | 'confirmedFar' | 'cost'> {
  let fa = 0;
  let fr = 0;
  for (const s of Array.from(impostor)) if (s >= scoreTau) fa++;
  for (const s of Array.from(genuine)) if (s < scoreTau) fr++;
  const far = rate(fa, impostor.length);
  const frr = rate(fr, genuine.length);
  return {
    far,
    frr,
    confirmedFar: impostor.length ? confirmedRate(fa, impostor.length) : null,
    cost: far.rate !== null && frr.rate !== null ? costs.cFA * far.rate + costs.cFR * frr.rate : null,
  };
}

/** Сумма ошибок по блокам перекрёстной проверки: каждая проба проверена порогом, подобранным без неё. */
export function pooled(
  parts: readonly Pick<HoldoutRow, 'far' | 'frr'>[],
  costs: CostsDto,
): Pick<HoldoutRow, 'far' | 'frr' | 'confirmedFar' | 'cost'> {
  const sum = (k: 'far' | 'frr', f: 'errors' | 'total') => parts.reduce((a, p) => a + p[k][f], 0);
  const far = rate(sum('far', 'errors'), sum('far', 'total'));
  const frr = rate(sum('frr', 'errors'), sum('frr', 'total'));
  return {
    far,
    frr,
    confirmedFar: far.total ? confirmedRate(far.errors, far.total) : null,
    cost: far.rate !== null && frr.rate !== null ? costs.cFA * far.rate + costs.cFR * frr.rate : null,
  };
}

/** Разбиение людей на калибровочную и тестовую половины: чётные и нечётные по порядку — воспроизводимо. */
export function splitSubjects<T>(subjects: readonly T[]): { calibration: T[]; test: T[] } {
  return {
    calibration: subjects.filter((_, i) => i % 2 === 0),
    test: subjects.filter((_, i) => i % 2 === 1),
  };
}

const num = (x: number | null | undefined, digits = 4) =>
  x === null || x === undefined ? '—' : x.toLocaleString('ru-RU', { maximumSignificantDigits: digits });
const pct = (r: RateWithInterval) =>
  r.rate === null || !r.interval
    ? '—'
    : `${num(r.rate * 100, 3)} % [${num(r.interval[0] * 100, 3)}; ${num(r.interval[1] * 100, 3)}]`;

export function holdoutCsv(r: HoldoutReport): string {
  const head =
    'modality,label,tau,applied,far,far_low,far_high,far_errors,impostor,frr,frr_low,frr_high,frr_errors,genuine,confirmed_far,cost';
  const lines = r.rows.map((x) =>
    [
      x.modality,
      `"${x.label.replace(/"/g, '""')}"`,
      x.tau,
      x.applied,
      x.far.rate ?? '',
      x.far.interval?.[0] ?? '',
      x.far.interval?.[1] ?? '',
      x.far.errors,
      x.far.total,
      x.frr.rate ?? '',
      x.frr.interval?.[0] ?? '',
      x.frr.interval?.[1] ?? '',
      x.frr.errors,
      x.frr.total,
      x.confirmedFar ?? '',
      x.cost ?? '',
    ].join(','),
  );
  return `${[head, ...lines].join('\n')}\n`;
}

/** Таблицы для раздела отчёта (docs/protocol/03-report-template.md) — готовый Markdown. */
export function holdoutMarkdown(r: HoldoutReport): string {
  const out: string[] = [
    '# Протокол «до/после калибровки» на открытых наборах',
    '',
    `Сформирован ${r.generatedAt} командой \`make calibrate\`. Стоимости: cFA = ${num(r.costs.cFA)}, ` +
      `cFR = ${num(r.costs.cFR)}; целевой FAR ${num(r.targetFar)}. Политика: ` +
      `v${r.policy.before ?? '—'} (до) → v${r.policy.after ?? r.policy.before ?? '—'} (после).`,
    '',
    'Строки «до» и «после» считаются на всей выборке, на которой подбирался порог: меняется только порог. Строка',
    '«перекрёстная проверка» — несмещённая оценка для лица: люди разбиты на два блока по 20, порог подбирается тем же',
    'правилом на одном блоке и проверяется на другом (только пары внутри блока), ошибки суммируются. Интервалы — 95% Уилсона; «FAR ≤» — верхняя граница с доверием 95 % (правило трёх при нуле ложных',
    'допусков). Порог ритма набора в политику не подставляется, его строки — на всей выборке.',
    '',
    '## Данные',
    '',
    '| Модальность | Набор | Людей | Сравнений: genuine / impostor | Эксперимент калибровки | Наборы оценок протокола |',
    '| --- | --- | --- | --- | --- | --- |',
    ...r.datasets.map(
      (d) =>
        `| ${d.modality === 'face' ? 'Лицо' : 'Ритм набора'} | ${d.name} | ${d.testSubjects} | ` +
        `${d.testGenuine} / ${d.testImpostor} | \`${d.calibrationExperimentId ?? '—'}\` | \`${d.testDatasetId ?? '—'}\` |`,
    ),
  ];
  for (const modality of ['face', 'keystroke'] as const) {
    const rows = r.rows.filter((x) => x.modality === modality);
    if (!rows.length) continue;
    out.push(
      '',
      modality === 'face'
        ? '## Таблица 1. Лицо: ошибки и ожидаемые потери'
        : '## Таблица 1а. Ритм набора: ошибки и ожидаемые потери',
      '',
      `| Порог | ${modality === 'face' ? 'τ_face' : 'τ_kd'} | В политике | FAR [95% ДИ] | FAR ≤ (95%) | FRR [95% ДИ] | E |`,
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...rows.map(
        (x) =>
          `| ${x.label} | ${num(x.tau)} | ${x.applied ? 'да' : 'нет'} | ${pct(x.far)} | ${num(x.confirmedFar, 3)} | ` +
          `${pct(x.frr)} | ${num(x.cost, 3)} |`,
      ),
    );
  }
  out.push(
    '',
    '## Источники данных',
    '',
    ...r.datasets.map((d) => `- ${d.name}: ${d.citation}`),
    '',
    'PAD (APCER/BPCER) на открытых снимках не оценивается: подлинное предъявление требует живой камеры — таблица 2',
    'строится на странице «Протокол» по испытаниям UC-8.',
    '',
  );
  return out.join('\n');
}
