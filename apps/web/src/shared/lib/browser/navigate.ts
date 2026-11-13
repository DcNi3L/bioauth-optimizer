/**
 * Полная загрузка адреса того же сайта, который обслуживает API через rewrites (/oidc/*, /api/*), а не страница
 * Next.js: клиентский переход туда невозможен. Адрес делается абсолютным.
 */
export function hardNavigate(path: string): void {
  window.location.assign(new URL(path, window.location.origin).toString());
}
