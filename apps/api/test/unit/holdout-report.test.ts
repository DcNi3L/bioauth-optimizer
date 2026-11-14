import {
  evaluateAt,
  holdoutCsv,
  holdoutMarkdown,
  type HoldoutReport,
  pooled,
  splitSubjects,
} from '../../src/modules/calibration/application/holdout-report';

const costs = { cFA: 10, cFR: 1 };

describe('протокол «до/после калибровки» (issue #31)', () => {
  const genuine = [0.9, 0.8, 0.5, 0.35];
  const impostor = [0.1, 0.2, 0.3, 0.4, 0.05];

  it('ошибки при пороге: допуск при s ≥ τ, интервалы Уилсона и ожидаемые потери', () => {
    const r = evaluateAt(genuine, impostor, 0.4, costs);
    expect(r.far).toMatchObject({ errors: 1, total: 5, rate: 0.2 });
    expect(r.frr).toMatchObject({ errors: 1, total: 4, rate: 0.25 });
    expect(r.far.interval![0]).toBeLessThan(0.2);
    expect(r.far.interval![1]).toBeGreaterThan(0.2);
    expect(r.cost).toBeCloseTo(10 * 0.2 + 0.25);
    expect(evaluateAt([], [], 0.4, costs)).toMatchObject({ cost: null, confirmedFar: null });
  });

  it('перекрёстная проверка: ошибки блоков суммируются, а не усредняются доли', () => {
    const a = evaluateAt([0.9], [0.5, 0.1, 0.1, 0.1], 0.4, costs); // 1 ложный допуск из 4
    const b = evaluateAt([0.3, 0.9], [0.1], 0.4, costs); // 1 ложный отказ из 2
    const p = pooled([a, b], costs);
    expect(p.far).toMatchObject({ errors: 1, total: 5 });
    expect(p.frr).toMatchObject({ errors: 1, total: 3 });
    expect(p.cost).toBeCloseTo(10 / 5 + 1 / 3);
  });

  it('разбиение людей воспроизводимо и без пересечений', () => {
    const s = ['s01', 's02', 's03', 's04', 's05'];
    const { calibration, test } = splitSubjects(s);
    expect(calibration).toEqual(['s01', 's03', 's05']);
    expect(test).toEqual(['s02', 's04']);
  });

  it('CSV и Markdown содержат строки «до» и «после» с интервалами', () => {
    const rep: HoldoutReport = {
      generatedAt: '2026-11-14T00:00:00.000Z',
      costs,
      targetFar: 1e-3,
      policy: { before: 1, after: 2 },
      datasets: [
        {
          modality: 'face',
          name: 'ORL',
          citation: 'Samaria & Harter, 1994',
          calibrationSubjects: 40,
          testSubjects: 40,
          testGenuine: 4,
          testImpostor: 5,
          calibrationExperimentId: 'exp-1',
          testDatasetId: 'ds-1',
        },
      ],
      rows: [
        {
          modality: 'face',
          label: 'до: v1',
          tau: 0.363,
          applied: true,
          ...evaluateAt(genuine, impostor, 0.363, costs),
        },
        {
          modality: 'face',
          label: 'после',
          tau: 0.45,
          applied: true,
          ...evaluateAt(genuine, impostor, 0.45, costs),
        },
      ],
    };
    const csv = holdoutCsv(rep).trim().split('\n');
    expect(csv).toHaveLength(3);
    expect(csv[1]).toMatch(/^face,"до: v1",0\.363,true,0\.2,/);
    const md = holdoutMarkdown(rep);
    expect(md).toContain('| до: v1 | 0,363 | да | 20 % [');
    expect(md).toContain('`exp-1`');
    expect(md).not.toContain('Таблица 1а'); // ритма нет — его таблицы тоже
  });
});
