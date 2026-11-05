import type { DeviceDto } from '@bioauth/contracts';

/** Грубый разбор User-Agent для списка устройств: браузер, ОС, тип. Без внешних зависимостей. */
export function parseUserAgent(ua: string | null): DeviceDto {
  if (!ua) return { browser: null, os: null, type: 'unknown' };
  const browser = /YaBrowser\/(\d+)/.exec(ua)
    ? `Яндекс Браузер ${/YaBrowser\/(\d+)/.exec(ua)![1]}`
    : /Edg\/(\d+)/.exec(ua)
      ? `Edge ${/Edg\/(\d+)/.exec(ua)![1]}`
      : /OPR\/(\d+)/.exec(ua)
        ? `Opera ${/OPR\/(\d+)/.exec(ua)![1]}`
        : /Firefox\/(\d+)/.exec(ua)
          ? `Firefox ${/Firefox\/(\d+)/.exec(ua)![1]}`
          : /(?:Chrome|CriOS)\/(\d+)/.exec(ua)
            ? `Chrome ${/(?:Chrome|CriOS)\/(\d+)/.exec(ua)![1]}`
            : /Version\/(\d+)[\d.]* .*Safari/.exec(ua)
              ? `Safari ${/Version\/(\d+)/.exec(ua)![1]}`
              : /curl\/|node|undici|python|okhttp/i.test(ua)
                ? 'API-клиент'
                : null;
  const os = /iPhone|iPad|iPod/.test(ua)
    ? `iOS ${/OS (\d+)[_\d]* like Mac/.exec(ua)?.[1] ?? ''}`.trim()
    : /Android (\d+)/.exec(ua)
      ? `Android ${/Android (\d+)/.exec(ua)![1]}`
      : ua.includes('Windows NT 10')
        ? 'Windows 10/11'
        : ua.includes('Windows')
          ? 'Windows'
          : ua.includes('Mac OS X')
            ? 'macOS'
            : ua.includes('CrOS')
              ? 'ChromeOS'
              : ua.includes('Linux')
                ? 'Linux'
                : null;
  const type =
    /iPad|Tablet/.test(ua) || (ua.includes('Android') && !ua.includes('Mobile'))
      ? 'tablet'
      : /Mobi|iPhone|Android/.test(ua)
        ? 'mobile'
        : browser || os
          ? 'desktop'
          : 'unknown';
  return { browser, os, type };
}
