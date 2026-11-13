'use client';

import { KeyRound, LogOut, RefreshCw, RotateCcw, UserRound } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { useT } from '@/shared/i18n';
import { hardNavigate } from '@/shared/lib/browser';
import { Avatar, Badge, Button, Notice, PageHeader, Panel } from '@/shared/ui';

import {
  challengeOf,
  decodeJwt,
  DEMO_CLIENT,
  DEMO_SCOPES,
  randomToken,
  savePending,
  takePending,
  tokenRequest,
  type TokenResponse,
} from '../model/pkce';

function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-80 overflow-auto rounded-lg border border-rule bg-paper p-3 font-mono text-[12px] leading-relaxed">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/**
 * Демо-приложение «на стороне клиента»: всё, что здесь происходит, сделал бы любой сторонний сервис,
 * подключённый к BioAuth как к серверу авторизации OpenID Connect.
 */
export function OauthDemoPage() {
  const t = useT();
  const params = useSearchParams();
  const redirectUri = typeof window === 'undefined' ? '' : `${window.location.origin}/oauth/demo`;
  const [tokens, setTokens] = useState<TokenResponse | null>(null);
  const [userinfo, setUserinfo] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const handled = useRef(false);

  // Возврат с сервера авторизации обрабатывается один раз — событием эффекта, а не телом эффекта.
  const onRedirect = useEffectEvent(() => {
    const code = params?.get('code');
    const err = params?.get('error');
    if (handled.current || (!code && !err)) return;
    handled.current = true;
    const pending = takePending();
    window.history.replaceState(null, '', '/oauth/demo');
    if (err) {
      setError(t('oauth.demo.denied', { error: err }));
      return;
    }
    if (!pending || params?.get('state') !== pending.state) {
      setError(t('oauth.demo.stateMismatch'));
      return;
    }
    setBusy('exchange');
    tokenRequest({
      grant_type: 'authorization_code',
      code: code!,
      redirect_uri: `${window.location.origin}/oauth/demo`,
      client_id: DEMO_CLIENT,
      code_verifier: pending.verifier,
    })
      .then((r) => {
        const claims = r.id_token ? decodeJwt(r.id_token)?.payload : null;
        if (claims?.nonce !== pending.nonce) throw new Error(t('oauth.demo.nonceMismatch'));
        setTokens(r);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setBusy(null));
  });
  // eslint-disable-next-line react-hooks/set-state-in-effect -- разовый разбор возврата OAuth: адрес и sessionStorage — внешняя система, ошибки показываются сразу
  useEffect(() => onRedirect(), [params]);

  const signIn = async () => {
    const verifier = randomToken(48);
    const state = randomToken(16);
    const nonce = randomToken(16);
    savePending({ verifier, state, nonce });
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: DEMO_CLIENT,
      redirect_uri: redirectUri,
      scope: DEMO_SCOPES,
      state,
      nonce,
      code_challenge: await challengeOf(verifier),
      code_challenge_method: 'S256',
    });
    hardNavigate(`/oidc/authorize?${q.toString()}`);
  };

  const callUserinfo = async () => {
    if (!tokens) return;
    setBusy('userinfo');
    try {
      const r = await fetch('/oidc/userinfo', {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      });
      setUserinfo(await r.json());
    } finally {
      setBusy(null);
    }
  };
  const refresh = async () => {
    if (!tokens?.refresh_token) return;
    setBusy('refresh');
    setError(null);
    try {
      setTokens(
        await tokenRequest({
          grant_type: 'refresh_token',
          refresh_token: tokens.refresh_token,
          client_id: DEMO_CLIENT,
        }),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };
  const logout = () => {
    const q = new URLSearchParams({ client_id: DEMO_CLIENT, post_logout_redirect_uri: redirectUri });
    if (tokens?.id_token) q.set('id_token_hint', tokens.id_token);
    hardNavigate(`/oidc/logout?${q.toString()}`);
  };

  const id = tokens?.id_token ? decodeJwt(tokens.id_token) : null;
  const claims = id?.payload ?? {};
  const name =
    typeof claims.name === 'string' ? claims.name : typeof claims.sub === 'string' ? claims.sub : '';
  const access = tokens ? decodeJwt(tokens.access_token) : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader
        eyebrow="OpenID Connect · bioauth-demo"
        title={t('oauth.demo.title')}
        description={t('oauth.demo.subtitle')}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {busy === 'exchange' && <Notice tone="info">{t('oauth.demo.exchanging')}</Notice>}
      {!tokens ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Panel>
            <div className="flex flex-col items-center gap-5 py-6 text-center">
              <span className="rounded-2xl bg-paper p-4 text-frr">
                <KeyRound className="size-10" aria-hidden />
              </span>
              <Button onClick={() => void signIn()} className="h-11 px-6">
                {t('oauth.demo.signIn')}
              </Button>
              <code className="text-xs break-all text-graphite">scope={DEMO_SCOPES}</code>
            </div>
          </Panel>
          <Panel title={t('oauth.demo.flow')}>
            <ol className="flex flex-col gap-3 text-sm">
              {(['step1', 'step2', 'step3', 'step4'] as const).map((s, i) => (
                <li key={s} className="flex gap-3">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-sheet">
                    {i + 1}
                  </span>
                  <span>{t(`oauth.demo.${s}`)}</span>
                </li>
              ))}
            </ol>
          </Panel>
        </div>
      ) : (
        <>
          <Panel>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
              <Avatar
                src={typeof claims.picture === 'string' ? claims.picture : null}
                name={name}
                size={56}
              />
              <div className="min-w-0 flex-1">
                <p className="text-lg font-medium">{t('oauth.demo.signedIn', { name })}</p>
                <p className="mt-1 flex flex-wrap gap-1.5">
                  {typeof claims.role === 'string' && <Badge tone="frr">{claims.role}</Badge>}
                  {Array.isArray(claims.amr) &&
                    claims.amr.map((a) => (
                      <Badge key={String(a)} tone="optimum">
                        amr: {String(a)}
                      </Badge>
                    ))}
                  {typeof claims.acr === 'string' && <Badge>acr: {claims.acr}</Badge>}
                  <Badge>{t('oauth.demo.expiresIn', { n: tokens.expires_in })}</Badge>
                </p>
              </div>
              <div className="flex flex-wrap gap-2 border-t border-rule pt-4 lg:border-t-0 lg:pt-0">
                <Button
                  variant="secondary"
                  size="sm"
                  busy={busy === 'userinfo'}
                  onClick={() => void callUserinfo()}
                >
                  <UserRound className="size-4" /> {t('oauth.demo.userinfo')}
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!tokens.refresh_token}
                  busy={busy === 'refresh'}
                  onClick={() => void refresh()}
                >
                  <RefreshCw className="size-4" /> {t('oauth.demo.refresh')}
                </Button>
                <Button variant="secondary" size="sm" onClick={logout}>
                  <LogOut className="size-4" /> {t('oauth.demo.logout')}
                </Button>
                <Button variant="subtle" size="sm" onClick={() => setTokens(null)}>
                  <RotateCcw className="size-4" /> {t('oauth.demo.reset')}
                </Button>
              </div>
            </div>
          </Panel>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <Panel title={t('oauth.demo.idToken')}>
              <Json value={id} />
            </Panel>
            <Panel title={t('oauth.demo.accessToken')}>
              <Json value={access} />
            </Panel>
          </div>
          {userinfo !== null && (
            <Panel title="userinfo">
              <Json value={userinfo} />
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
