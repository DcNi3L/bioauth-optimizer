/** Публичный адрес интерфейса — для канонических ссылок, Open Graph и карты сайта. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const SITE_NAME = 'BioAuth';
export const SITE_TITLE = 'BioAuth — биометрическая аутентификация и OpenID Connect';
export const SITE_DESCRIPTION =
  'Сервер биометрической аутентификации: вход по лицу со случайными командами и passkey, OpenID Connect для ' +
  'сторонних сервисов, оптимальный порог и состав факторов по формулам байесовской стоимости.';
export const THEME_LIGHT = '#f3f5f2';
export const THEME_DARK = '#0e1318';
export const BRAND = '#17202b';
