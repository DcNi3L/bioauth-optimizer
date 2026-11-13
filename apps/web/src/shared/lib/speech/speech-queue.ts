/** Решение «озвучивать ли подсказку сейчас»: подсказка сканера меняется много раз в секунду, диктор не должен тараторить. */
export interface SpeechGate {
  /** Последний озвученный текст и время. */
  readonly spoken: string | null;
  readonly spokenAt: number;
  /** Текст-кандидат и время, с которого он держится без изменений. */
  readonly pending: string | null;
  readonly pendingSince: number;
}

export const INITIAL_GATE: SpeechGate = { spoken: null, spokenAt: -Infinity, pending: null, pendingSince: 0 };

/** Подсказка должна продержаться STABLE_MS; та же фраза повторяется не чаще REPEAT_MS; разные — не чаще GAP_MS. */
export const STABLE_MS = 350;
export const GAP_MS = 1200;
export const REPEAT_MS = 6000;

export function nextGate(
  gate: SpeechGate,
  text: string | null,
  now: number,
): { gate: SpeechGate; say: string | null } {
  if (text !== gate.pending) return { gate: { ...gate, pending: text, pendingSince: now }, say: null };
  if (!text || now - gate.pendingSince < STABLE_MS) return { gate, say: null };
  const since = now - gate.spokenAt;
  if (text === gate.spoken ? since < REPEAT_MS : since < GAP_MS) return { gate, say: null };
  return { gate: { ...gate, spoken: text, spokenAt: now }, say: text };
}

const BCP47: Record<string, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-US' };

export function speechLang(locale: string): string {
  return BCP47[locale] ?? locale;
}

/** Голос для языка: точное совпадение, затем по первой части тега; null — браузер выберет сам. */
export function pickVoice<V extends { lang: string; localService?: boolean }>(
  voices: readonly V[],
  locale: string,
): V | null {
  const lang = speechLang(locale).toLowerCase();
  const base = lang.split('-')[0]!;
  const norm = (v: V) => v.lang.toLowerCase().replace('_', '-');
  return (
    voices.find((v) => norm(v) === lang && v.localService) ??
    voices.find((v) => norm(v) === lang) ??
    voices.find((v) => norm(v).split('-')[0] === base) ??
    null
  );
}
