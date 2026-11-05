import { createHash, createPublicKey, createVerify, randomBytes } from 'node:crypto';

import { type Agent, createV2App, loginStaff, registerSubject, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;

const ORIGIN = 'http://localhost:3000';
const DEMO_REDIRECT = `${ORIGIN}/oauth/demo`;

const pkce = () => {
  const verifier = randomBytes(48).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

/** 1×1 PNG (с запасом до минимального размера 64 байта). */
const PNG = Buffer.concat([
  Buffer.from(
    '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082',
    'hex',
  ),
]);

function verifyIdToken(token: string, jwks: { keys: Record<string, unknown>[] }) {
  const [h, p, s] = token.split('.') as [string, string, string];
  const header = JSON.parse(Buffer.from(h, 'base64url').toString()) as { kid: string; alg: string };
  const jwk = jwks.keys.find((k) => k.kid === header.kid)!;
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'));
  return {
    ok,
    alg: header.alg,
    payload: JSON.parse(Buffer.from(p, 'base64url').toString()) as Record<string, unknown>,
  };
}

describeDb('API v3 e2e: учётные записи, админ-панель, OpenID Connect (PostgreSQL)', () => {
  let ctx: V2App;
  let admin: Agent;
  let subject: Agent;

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    admin = ctx.agent();
    await loginStaff(admin);
    subject = ctx.agent();
    await registerSubject(subject, 'oidc-user');
  });

  afterAll(async () => {
    await (ctx as V2App | undefined)?.close();
  });

  it('сессии и устройства: список, завершение другой сессии, история входов с отказами', async () => {
    const second = ctx.agent();
    await loginStaff(second);
    await ctx
      .agent()
      .post('/api/v1/identity/login')
      .send({ login: 'admin', password: 'wrong-password-1' })
      .expect(401);

    const list = await admin
      .get('/api/v1/identity/sessions')
      .set(
        'user-agent',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
      )
      .expect(200);
    expect(list.body.length).toBeGreaterThanOrEqual(2);
    const current = list.body.find((s: { current: boolean }) => s.current);
    expect(current).toMatchObject({ amr: ['pwd'], mfa: true });
    const other = list.body.find((s: { current: boolean }) => !s.current);

    await admin.delete(`/api/v1/identity/sessions/${current.id}`).expect(400);
    await admin.delete(`/api/v1/identity/sessions/${other.id}`).expect(204);
    await second.get('/api/v1/identity/me').expect(401);

    const history = await admin.get('/api/v1/identity/login-history?limit=10').expect(200);
    expect(
      history.body.some((e: { success: boolean; method: string }) => e.success && e.method === 'password'),
    ).toBe(true);
    expect(
      history.body.some(
        (e: { success: boolean; reason: string }) => !e.success && e.reason === 'BAD_CREDENTIALS',
      ),
    ).toBe(true);
  });

  it('профиль и аватар: почта, загрузка PNG, проверка формата по содержимому', async () => {
    await subject
      .patch('/api/v1/identity/me')
      .send({ email: 'user@example.org', displayName: 'Пользователь OIDC' })
      .expect(204);
    await subject
      .put('/api/v1/identity/me/avatar')
      .send({ image: `data:image/png;base64,${PNG.toString('base64')}` })
      .expect(204);
    await subject
      .put('/api/v1/identity/me/avatar')
      .send({ image: `data:image/png;base64,${Buffer.from('<svg>'.repeat(30)).toString('base64')}` })
      .expect(400);
    const me = await subject.get('/api/v1/identity/me').expect(200);
    expect(me.body).toMatchObject({ email: 'user@example.org', displayName: 'Пользователь OIDC' });
    expect(me.body.avatarUrl).toMatch(/^\/api\/v1\/avatars\//);
    const img = await ctx
      .agent()
      .get(me.body.avatarUrl as string)
      .expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    const other = ctx.agent();
    await registerSubject(other, 'email-clash', false);
    await other.patch('/api/v1/identity/me').send({ email: 'USER@example.org' }).expect(409);
  });

  it('админ-панель: сводка, поиск, создание сотрудника, защита от самопонижения, отключение', async () => {
    const stats = await admin.get('/api/v1/admin/stats').expect(200);
    expect(stats.body.users.total).toBeGreaterThanOrEqual(3);
    expect(stats.body.logins.byDay).toHaveLength(14);
    await subject.get('/api/v1/admin/stats').expect(403);

    const found = await admin.get('/api/v1/admin/users?q=oidc').expect(200);
    expect(found.body.items.map((u: { login: string }) => u.login)).toContain('oidc-user');
    const user = found.body.items.find((u: { login: string }) => u.login === 'oidc-user');
    expect(user).toMatchObject({ face: true, consent: true, email: 'user@example.org' });

    const created = await admin
      .post('/api/v1/admin/users')
      .send({ login: 'anna', displayName: 'Анна', role: 'researcher', password: 'researcher-pass-1' })
      .expect(201);
    expect(created.body).toMatchObject({ role: 'researcher', passkeys: 0 });
    const anna = ctx.agent();
    await loginStaff(anna, 'anna', 'researcher-pass-1');
    await anna.get('/api/v1/admin/users').expect(403);

    const me = await admin.get('/api/v1/identity/me').expect(200);
    await admin.patch(`/api/v1/admin/users/${me.body.id}`).send({ role: 'auditor' }).expect(403);
    await admin.patch(`/api/v1/admin/users/${created.body.id}`).send({ disabled: true }).expect(200);
    await anna.get('/api/v1/identity/me').expect(401);
    await ctx
      .agent()
      .post('/api/v1/identity/login')
      .send({ login: 'anna', password: 'researcher-pass-1' })
      .expect(403);
    // Отключение фиксируется в истории входов как отказ (после верного пароля).

    const detail = await admin.get(`/api/v1/admin/users/${user.id}`).expect(200);
    expect(detail.body.history.length).toBeGreaterThan(0);
    const audit = await admin.get('/api/v1/audit/events?limit=20').expect(200);
    expect(audit.body.map((e: { action: string }) => e.action)).toEqual(
      expect.arrayContaining(['user.created', 'user.updated']),
    );
  });

  it('справочник API (Scalar) работает без внешних ресурсов; спецификация OpenAPI доступна', async () => {
    const page = await ctx.agent().get('/api/docs').expect(200);
    expect(page.headers['content-type']).toMatch(/text\/html/);
    expect(page.text).toContain('<script src="/api/docs/assets/standalone.js"></script>');
    expect(page.text).not.toMatch(/cdn\.jsdelivr|fonts\.scalar|unpkg/);
    const asset = await ctx.agent().get('/api/docs/assets/standalone.js').expect(200);
    expect(asset.headers['content-type']).toMatch(/javascript/);
    const spec = await ctx.agent().get('/api/openapi.json').expect(200);
    expect(spec.body).toMatchObject({ info: { title: 'BioAuth API' } });
    expect(Object.keys(spec.body.paths as object)).toEqual(expect.arrayContaining(['/api/v1/admin/users']));
    await ctx.agent().get('/api/docs-json').expect(200);
  });

  describe('OpenID Connect', () => {
    let jwks: { keys: Record<string, unknown>[] };
    let secret: string;

    it('обнаружение и JWKS', async () => {
      const d = await ctx.agent().get('/.well-known/openid-configuration').expect(200);
      expect(d.body).toMatchObject({
        issuer: ORIGIN,
        token_endpoint: `${ORIGIN}/oidc/token`,
        code_challenge_methods_supported: ['S256'],
      });
      jwks = (await ctx.agent().get('/oidc/jwks').expect(200)).body;
      expect(jwks.keys[0]).toMatchObject({ kty: 'RSA', alg: 'RS256', use: 'sig' });
      expect(jwks.keys[0]).not.toHaveProperty('d');
    });

    it('администратор регистрирует конфиденциального клиента; секрет показывается один раз', async () => {
      const r = await admin
        .post('/api/v1/admin/oauth-clients')
        .send({
          clientId: 'svc-backend',
          name: 'Служебный сервис',
          type: 'confidential',
          redirectUris: ['http://localhost:4100/cb'],
          grantTypes: ['authorization_code', 'refresh_token', 'client_credentials'],
          scopes: ['openid', 'profile', 'roles', 'biometrics', 'offline_access'],
        })
        .expect(201);
      secret = r.body.clientSecret as string;
      expect(secret).toHaveLength(43);
      const list = await admin.get('/api/v1/admin/oauth-clients').expect(200);
      expect(list.body.map((c: { clientId: string }) => c.clientId)).toEqual(
        expect.arrayContaining(['svc-backend', 'bioauth-demo']),
      );
      expect(JSON.stringify(list.body)).not.toContain(secret);
      await admin
        .post('/api/v1/admin/oauth-clients')
        .send({
          clientId: 'bad-public',
          name: 'x',
          type: 'public',
          redirectUris: [],
          grantTypes: ['client_credentials'],
          scopes: ['roles'],
        })
        .expect(400);
    });

    it('код авторизации + PKCE: вход, согласие, токены, подпись ID-токена, userinfo', async () => {
      const { verifier, challenge } = pkce();
      const q = new URLSearchParams({
        response_type: 'code',
        client_id: 'bioauth-demo',
        redirect_uri: DEMO_REDIRECT,
        scope: 'openid profile email roles offline_access',
        state: 'st-123',
        nonce: 'n-456',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      });
      // Без сессии — на страницу входа интерфейса с идентификатором запроса.
      const anon = await ctx.agent().get(`/oidc/authorize?${q.toString()}`).expect(302);
      expect(anon.headers.location).toMatch(new RegExp(`^${ORIGIN}/login\\?oauth=[0-9a-f-]{36}$`));
      // prompt=none без сессии — ошибка в redirect_uri.
      const none = await ctx.agent().get(`/oidc/authorize?${q.toString()}&prompt=none`).expect(302);
      expect(none.headers.location).toContain('error=login_required');
      expect(none.headers.location).toContain('state=st-123');

      const r = await subject.get(`/oidc/authorize?${q.toString()}`).expect(302);
      expect(r.headers.location).toMatch(new RegExp(`^${ORIGIN}/oauth/consent\\?request=`));
      const id = new URL(r.headers.location!).searchParams.get('request')!;
      // Страница входа показывает название приложения и без сессии.
      const anonId = new URL(anon.headers.location!).searchParams.get('oauth')!;
      const anonInfo = await ctx.agent().get(`/api/v1/oauth/requests/${anonId}`).expect(200);
      expect(anonInfo.body).toMatchObject({ client: { name: expect.any(String) }, user: null });
      const info = await subject.get(`/api/v1/oauth/requests/${id}`).expect(200);
      expect(info.body).toMatchObject({
        client: { clientId: 'bioauth-demo' },
        redirectHost: 'localhost:3000',
        user: { login: 'oidc-user' },
      });
      const dec = await subject
        .post(`/api/v1/oauth/requests/${id}/decision`)
        .send({ approve: true })
        .expect(200);
      const back = new URL(dec.body.redirectTo as string);
      expect(back.origin + back.pathname).toBe(DEMO_REDIRECT);
      expect(back.searchParams.get('state')).toBe('st-123');
      expect(back.searchParams.get('iss')).toBe(ORIGIN);
      const code = back.searchParams.get('code')!;

      const tok = await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: DEMO_REDIRECT,
          client_id: 'bioauth-demo',
          code_verifier: verifier,
        })
        .expect(200);
      expect(tok.headers['cache-control']).toBe('no-store');
      expect(tok.body).toMatchObject({ token_type: 'Bearer', expires_in: 600 });
      const id_token = verifyIdToken(tok.body.id_token as string, jwks);
      expect(id_token.ok).toBe(true);
      expect(id_token.payload).toMatchObject({
        iss: ORIGIN,
        aud: 'bioauth-demo',
        nonce: 'n-456',
        preferred_username: 'oidc-user',
        name: 'Пользователь OIDC',
        email: 'user@example.org',
        role: 'subject',
      });
      expect(id_token.payload.picture).toMatch(new RegExp(`^${ORIGIN}/api/v1/avatars/`));

      const ui = await ctx
        .agent()
        .get('/oidc/userinfo')
        .set('authorization', `Bearer ${tok.body.access_token as string}`)
        .expect(200);
      expect(ui.body).toMatchObject({ sub: id_token.payload.sub, preferred_username: 'oidc-user' });
      await ctx.agent().get('/oidc/userinfo').set('authorization', 'Bearer x.y.z').expect(401);

      // Ротация refresh-токена и обнаружение повторного использования.
      const r1 = tok.body.refresh_token as string;
      const t2 = await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: r1, client_id: 'bioauth-demo' })
        .expect(200);
      const r2 = t2.body.refresh_token as string;
      expect(r2).not.toBe(r1);
      await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: r1, client_id: 'bioauth-demo' })
        .expect(400);
      await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({ grant_type: 'refresh_token', refresh_token: r2, client_id: 'bioauth-demo' })
        .expect(400);

      // Повторное предъявление кода отклоняется (и отзывает выданное по нему).
      await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: DEMO_REDIRECT,
          client_id: 'bioauth-demo',
          code_verifier: verifier,
        })
        .expect(400)
        .expect((x) => expect(x.body.error).toBe('invalid_grant'));

      // Согласие запомнено: повторная авторизация сразу возвращает код.
      const again = await subject.get(`/oidc/authorize?${q.toString()}`).expect(302);
      expect(again.headers.location).toMatch(new RegExp(`^${DEMO_REDIRECT}\\?code=`));
    });

    it('ошибки запроса авторизации: чужой redirect_uri, нет PKCE у публичного клиента, лишний scope', async () => {
      const base = { response_type: 'code', client_id: 'bioauth-demo', scope: 'openid' };
      const bad = await subject
        .get(
          `/oidc/authorize?${new URLSearchParams({ ...base, redirect_uri: 'https://evil.example/cb' }).toString()}`,
        )
        .expect(302);
      expect(bad.headers.location).toMatch(new RegExp(`^${ORIGIN}/oauth/error\\?`));
      const noPkce = await subject
        .get(`/oidc/authorize?${new URLSearchParams({ ...base, redirect_uri: DEMO_REDIRECT }).toString()}`)
        .expect(302);
      expect(noPkce.headers.location).toContain('error=invalid_request');
      const { challenge } = pkce();
      const scope = await subject
        .get(
          `/oidc/authorize?${new URLSearchParams({ ...base, redirect_uri: DEMO_REDIRECT, scope: 'openid admin', code_challenge: challenge, code_challenge_method: 'S256' }).toString()}`,
        )
        .expect(302);
      expect(scope.headers.location).toContain('error=invalid_scope');
      const unknown = await subject.get('/oidc/authorize?client_id=nope&response_type=code').expect(302);
      expect(unknown.headers.location).toContain('/oauth/error');
    });

    it('client credentials, интроспекция и отзыв для конфиденциального клиента', async () => {
      const basic = `Basic ${Buffer.from(`svc-backend:${secret}`).toString('base64')}`;
      const cc = await ctx
        .agent()
        .post('/oidc/token')
        .set('authorization', basic)
        .type('form')
        .send({ grant_type: 'client_credentials', scope: 'roles' })
        .expect(200);
      expect(cc.body).toMatchObject({ token_type: 'Bearer', scope: 'roles' });
      expect(cc.body).not.toHaveProperty('refresh_token');
      await ctx
        .agent()
        .post('/oidc/token')
        .set('authorization', `Basic ${Buffer.from('svc-backend:wrong').toString('base64')}`)
        .type('form')
        .send({ grant_type: 'client_credentials' })
        .expect(401)
        .expect((x) => expect(x.body.error).toBe('invalid_client'));
      const intro = await ctx
        .agent()
        .post('/oidc/introspect')
        .set('authorization', basic)
        .type('form')
        .send({ token: cc.body.access_token as string })
        .expect(200);
      expect(intro.body).toMatchObject({ active: true, client_id: 'svc-backend', sub: 'svc-backend' });
      const dead = await ctx
        .agent()
        .post('/oidc/introspect')
        .set('authorization', basic)
        .type('form')
        .send({ token: 'garbage' })
        .expect(200);
      expect(dead.body).toEqual({ active: false });
      // Публичный клиент интроспекцию не выполняет.
      await ctx
        .agent()
        .post('/oidc/introspect')
        .type('form')
        .send({ client_id: 'bioauth-demo', token: 'x' })
        .expect(401);
      // userinfo с токеном клиента (без пользователя) запрещён.
      await ctx
        .agent()
        .get('/oidc/userinfo')
        .set('authorization', `Bearer ${cc.body.access_token as string}`)
        .expect(403);
    });

    it('подключённые приложения: список и отключение; выход возвращает в приложение', async () => {
      const apps = await subject.get('/api/v1/oauth/apps').expect(200);
      expect(apps.body.map((a: { clientId: string }) => a.clientId)).toContain('bioauth-demo');
      await subject.delete('/api/v1/oauth/apps/bioauth-demo').expect(204);
      await subject.delete('/api/v1/oauth/apps/bioauth-demo').expect(404);
      const out = await subject
        .get(
          `/oidc/logout?client_id=bioauth-demo&post_logout_redirect_uri=${encodeURIComponent(DEMO_REDIRECT)}&state=bye`,
        )
        .expect(302);
      // Без id_token_hint сессия молча не завершается: пользователь подтверждает выход в интерфейсе.
      expect(out.headers.location).toMatch(new RegExp(`^${ORIGIN}/oauth/logout\\?client_id=bioauth-demo`));
      await subject.get('/api/v1/identity/me').expect(200);
      const info = await ctx.agent().get('/api/v1/oauth/logout?client_id=bioauth-demo').expect(200);
      expect(info.body.clientName).toEqual(expect.any(String));
      const confirmed = await subject
        .post('/api/v1/oauth/logout')
        .set('origin', ORIGIN)
        .send({ clientId: 'bioauth-demo', postLogoutRedirectUri: DEMO_REDIRECT, state: 'bye' })
        .expect(200);
      expect(confirmed.body.redirectTo).toBe(`${DEMO_REDIRECT}?state=bye`);
      await subject.get('/api/v1/identity/me').expect(401);
      // Чужой адрес возврата не используется — только страница входа.
      const foreign = await ctx
        .agent()
        .post('/api/v1/oauth/logout')
        .send({ clientId: 'bioauth-demo', postLogoutRedirectUri: 'https://evil.example/' })
        .expect(200);
      expect(foreign.body.redirectTo).toBe(`${ORIGIN}/login`);
      const history = await admin.get('/api/v1/admin/login-events?limit=50').expect(200);
      expect(
        history.body.some(
          (e: { method: string; clientId: string }) => e.method === 'oidc' && e.clientId === 'bioauth-demo',
        ),
      ).toBe(true);
    });

    it('отключённый пользователь теряет доступ приложений: refresh и userinfo отклоняются', async () => {
      const { challenge, verifier } = pkce();
      const q = new URLSearchParams({
        response_type: 'code',
        client_id: 'bioauth-demo',
        redirect_uri: DEMO_REDIRECT,
        scope: 'openid offline_access',
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      // Пользователь проходит поток, получает refresh-токен, затем администратор его отключает.
      const user = ctx.agent();
      await registerSubject(user, 'to-disable', false);
      const r = await user.get(`/oidc/authorize?${q}`).expect(302);
      const id = new URL(r.headers.location!).searchParams.get('request')!;
      const dec = await user
        .post(`/api/v1/oauth/requests/${id}/decision`)
        .send({ approve: true })
        .expect(200);
      const code = new URL(dec.body.redirectTo as string).searchParams.get('code')!;
      const tok = await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({
          grant_type: 'authorization_code',
          code,
          redirect_uri: DEMO_REDIRECT,
          client_id: 'bioauth-demo',
          code_verifier: verifier,
        })
        .expect(200);
      const uid = (await user.get('/api/v1/identity/me').expect(200)).body.id as string;
      await admin.patch(`/api/v1/admin/users/${uid}`).send({ disabled: true }).expect(200);
      await ctx
        .agent()
        .post('/oidc/token')
        .type('form')
        .send({
          grant_type: 'refresh_token',
          refresh_token: tok.body.refresh_token as string,
          client_id: 'bioauth-demo',
        })
        .expect(400);
      await ctx
        .agent()
        .get('/oidc/userinfo')
        .set('authorization', `Bearer ${tok.body.access_token as string}`)
        .expect(401);
    });

    it('повторённые параметры и некорректный Basic не роняют сервер', async () => {
      const dup = await subject
        .get('/oidc/authorize?client_id=bioauth-demo&client_id=x&response_type=code')
        .expect(302);
      expect(dup.headers.location).toContain('/oauth/error');
      await ctx
        .agent()
        .post('/oidc/token')
        .set('authorization', `Basic ${Buffer.from('svc-backend:%E0%A4%A').toString('base64')}`)
        .type('form')
        .send({ grant_type: 'client_credentials' })
        .expect(401);
    });
  });
});
