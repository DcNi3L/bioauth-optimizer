import type { DeviceDto, LoginEventDto } from '@bioauth/contracts';

import type { TFn, TKey } from '@/shared/i18n';

/** «Chrome · macOS» или «Телефон», если браузер не определён. */
export function deviceLabel(t: TFn, d: DeviceDto): string {
  const parts = [d.browser, d.os].filter((x): x is string => !!x);
  return parts.length ? parts.join(' · ') : t(`device.${d.type}` as TKey);
}

export const methodLabel = (t: TFn, m: LoginEventDto['method']) => t(`method.${m}` as TKey);

/** amr (RFC 8176) на языке интерфейса; неизвестные значения показываются как есть. */
export function amrLabel(t: TFn, amr: string): string {
  return ['face', 'hwk', 'otp', 'kbd', 'pwd', 'mfa'].includes(amr) ? t(`amr.${amr}` as TKey) : amr;
}

/** Причина отказа: коды проверки лица переведены в словаре, остальные (BAD_CREDENTIALS…) — как есть. */
export function reasonLabel(t: TFn, reason: string | null): string | null {
  if (!reason) return null;
  const key = `face.reason.${reason}` as TKey;
  const s = t(key);
  return s === key ? reason.replaceAll('_', ' ').toLowerCase() : s;
}
