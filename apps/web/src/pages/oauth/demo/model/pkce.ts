/** Помощники публичного клиента OAuth 2.1: PKCE S256, state/nonce, разбор JWT без проверки подписи. */

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const randomToken = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export function decodeJwt(
  token: string,
): { header: Record<string, unknown>; payload: Record<string, unknown> } | null {
  const [h, p] = token.split('.');
  if (!h || !p) return null;
  const dec = (s: string) => {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))) as Record<
      string,
      unknown
    >;
  };
  try {
    return { header: dec(h), payload: dec(p) };
  } catch {
    return null;
  }
}

const KEY = 'bioauth.demo.pending';

export interface Pending {
  verifier: string;
  state: string;
  nonce: string;
}

export function savePending(p: Pending) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // без хранилища вход в демо невозможен — пользователь увидит ошибку state
  }
}

export function takePending(): Pending | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    return raw ? (JSON.parse(raw) as Pending) : null;
  } catch {
    return null;
  }
}

export interface TokenResponse {
  access_token: string;
  id_token?: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

export const DEMO_CLIENT = 'bioauth-demo';
export const DEMO_SCOPES = 'openid profile email roles offline_access biometrics';

export async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch('/oidc/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  });
  const json = (await res.json()) as TokenResponse & { error?: string; error_description?: string };
  if (!res.ok) throw new Error(`${json.error ?? res.status}: ${json.error_description ?? ''}`);
  return json;
}
