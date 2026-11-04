const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

const ru = (x: number, digits: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/** Число с запятой; очень малые и большие — в научной нотации «5,0·10⁻¹¹». */
export function formatNumber(x: number | null | undefined, digits = 4): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  if (x === 0) return '0';
  const abs = Math.abs(x);
  if (abs < 1e-3 || abs >= 1e6) return formatSci(x, 2);
  return ru(x, digits);
}

export function formatSci(x: number, significant = 2): string {
  if (x === 0) return '0';
  let exp = Math.floor(Math.log10(Math.abs(x)));
  const digits = Math.max(0, Math.min(20, significant - 1));
  let mantissa = x / 10 ** exp;
  // Округление мантиссы до 10,0 переносится в порядок: 9,96·10⁻³ → 1,0·10⁻².
  if (Math.abs(Number(mantissa.toFixed(digits))) >= 10) {
    exp += 1;
    mantissa /= 10;
  }
  const m = mantissa.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (exp === 0) return m;
  const e = String(exp).split('').map((c) => SUPERSCRIPT[c] ?? c).join('');
  return `${m}·10${e}`;
}

/** Доля → проценты: 0,017864 → «1,786 %». */
export function formatPercent(x: number | null | undefined, digits = 3): string {
  if (x === null || x === undefined || Number.isNaN(x)) return '—';
  const p = x * 100;
  if (p !== 0 && Math.abs(p) < 0.001) return `${formatSci(p, 2)} %`;
  return `${ru(p, digits)} %`;
}

export function formatMs(x: number): string {
  return `${ru(x, 1)} мс`;
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'medium' });
}
