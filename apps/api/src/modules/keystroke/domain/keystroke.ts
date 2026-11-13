/**
 * Динамика набора текста: признаки и расстояние.
 *
 * Признаки одного ввода фразы из n клавиш: время удержания каждой клавиши H_i = up_i − down_i (n значений)
 * и интервалы «нажатие → нажатие» DD_i = down_{i+1} − down_i (n − 1 значений). Шаблон — среднее μ_j и
 * разброс σ_j по повторам. Расстояние — масштабированное манхэттенское (лучший классический детектор в работе
 * Killourhy & Maxion, 2009): d = mean_j min(|x_j − μ_j| / σ_j, CLIP). Отсечка CLIP не даёт одной ошибочной
 * паузе (отвлёкся, поправил пальцы) испортить весь ввод.
 */

export interface KeyEventLike {
  readonly code: string;
  readonly down: number;
  readonly up: number;
}

export interface KeystrokeTemplate {
  readonly mean: number[];
  readonly std: number[];
}

/** Версия признаков и детектора — метка оценок для калибровки (как версия модели лица). */
export const KEYSTROKE_MODEL = 'keystroke-sm-v1';

/** Отсечка нормированного отклонения одного признака. */
export const CLIP = 4;
/**
 * Порог принятия по умолчанию. Выбран по синтетической модели (см. test/unit/keystroke.test.ts): при нём
 * FAR около 1–2 %, FRR около 10 % (равный уровень ошибок около 6 % при пороге 1,2). Это проверка реализации, а не оценка на людях: в литературе EER клавиатурной
 * динамики для коротких фраз — порядка 5–15 %.
 */
export const DEFAULT_THRESHOLD = 1.1;
/** Нижняя граница разброса, мс: с малым числом повторов σ занижается, а шаблон становится «хрупким». */
const STD_FLOOR_ABS = 12;
const STD_FLOOR_REL = 0.08;

export type SampleIssue = 'LENGTH' | 'CODES' | 'TIMING' | 'ROBOTIC';

export class SampleError extends Error {
  constructor(
    readonly issue: SampleIssue,
    message: string,
  ) {
    super(message);
  }
}

/** Клавиши фразы в порядке нажатия: буквы — KeyA…KeyZ, пробел — Space. */
export function expectedCodes(phrase: string): string[] {
  return (phrase.match(/./g) ?? []).map((ch) => {
    if (ch === ' ') return 'Space';
    if (/^[a-z]$/.test(ch)) return `Key${ch.toUpperCase()}`;
    throw new Error(`символ «${ch}» не поддерживается: фраза — строчные латинские буквы и пробелы`);
  });
}

const mean = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / a.length;
const std = (a: readonly number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / Math.max(1, a.length - 1));
};

/**
 * Проверяет ввод и возвращает вектор признаков [H_0…H_{n−1}, DD_0…DD_{n−2}].
 * Отказ — SampleError: не та последовательность клавиш, невозможные времена или «роботизированный» ввод.
 */
export function extractFeatures(events: readonly KeyEventLike[], phrase: string): number[] {
  const codes = expectedCodes(phrase);
  if (events.length !== codes.length)
    throw new SampleError('LENGTH', `нужно набрать фразу целиком: ${codes.length} клавиш`);
  if (events.some((e, i) => e.code !== codes[i]))
    throw new SampleError('CODES', 'набрана не та фраза: ошибки и исправления не допускаются');

  const hold = events.map((e) => e.up - e.down);
  const dd = events.slice(1).map((e, i) => e.down - events[i]!.down);
  if (hold.some((h) => !(h >= 5 && h <= 2000)))
    throw new SampleError('TIMING', 'время удержания клавиши вне допустимых пределов');
  if (dd.some((d) => !(d >= 15 && d <= 5000)))
    throw new SampleError('TIMING', 'интервал между клавишами вне допустимых пределов');
  // Скрипт с постоянной паузой: разброс интервалов почти нулевой. У человека он на порядок больше.
  if (std(dd) < 3 || std(hold) < 2) throw new SampleError('ROBOTIC', 'ввод слишком ровный для человека');
  return [...hold, ...dd];
}

/** Шаблон по нескольким повторам: среднее и разброс с нижней границей. */
export function buildTemplate(vectors: readonly (readonly number[])[]): KeystrokeTemplate {
  if (vectors.length < 2) throw new Error('для шаблона нужно не менее двух повторов');
  const dim = vectors[0]!.length;
  const m: number[] = [];
  const s: number[] = [];
  for (let j = 0; j < dim; j++) {
    const col = vectors.map((v) => v[j]!);
    const mu = mean(col);
    m.push(mu);
    s.push(Math.max(std(col), STD_FLOOR_ABS + STD_FLOOR_REL * mu));
  }
  return { mean: m, std: s };
}

/** Среднее нормированное отклонение с отсечкой; 0 — точное совпадение со средним шаблона. */
export function distance(t: KeystrokeTemplate, x: readonly number[]): number {
  if (x.length !== t.mean.length) throw new Error('размерность признаков не совпадает с шаблоном');
  let sum = 0;
  for (let j = 0; j < x.length; j++) sum += Math.min(Math.abs(x[j]! - t.mean[j]!) / t.std[j]!, CLIP);
  return sum / x.length;
}

/** Согласованность повторов: среднее расстояние каждого повтора до шаблона, построенного по всем. */
export function consistency(t: KeystrokeTemplate, vectors: readonly (readonly number[])[]): number {
  return mean(vectors.map((v) => distance(t, v)));
}

export const scoreOf = (d: number): number => Math.max(0, Math.min(1, 1 - d / CLIP));

export const serializeTemplate = (t: KeystrokeTemplate): Buffer => Buffer.from(JSON.stringify(t), 'utf8');

export function parseTemplate(b: Buffer): KeystrokeTemplate {
  const t = JSON.parse(b.toString('utf8')) as KeystrokeTemplate;
  if (!Array.isArray(t.mean) || !Array.isArray(t.std) || t.mean.length !== t.std.length)
    throw new Error('повреждённый шаблон динамики набора');
  return t;
}
