/**
 * Разбор числа из поля ввода: десятичная запятая, экспонента «1e-6», «1,0·10^-6» и «1·10⁻⁶».
 * Возвращает null для пустой строки и NaN для нераспознанного текста.
 */
const FROM_SUPERSCRIPT: Record<string, string> = {
  '⁻': '-', '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
};

export function parseNumber(raw: string): number | null {
  let s = raw.trim().replace(/\s+/g, '');
  if (s === '') return null;
  s = Array.from(s, (c) => FROM_SUPERSCRIPT[c] ?? c).join('');
  s = s.replace(/[−–]/g, '-').replace(',', '.').replace(/[·×*]10\^?/, 'e');
  if (!/^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.test(s)) return Number.NaN;
  return Number(s);
}

export function numberToInput(x: number | null | undefined): string {
  if (x === null || x === undefined) return '';
  const abs = Math.abs(x);
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e9)) return x.toExponential().replace('.', ',');
  return String(x).replace('.', ',');
}
