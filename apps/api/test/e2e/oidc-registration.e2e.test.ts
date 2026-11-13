import { type Agent, createV2App, loginStaff, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;
const API = '/api/v1';

/** #47: динамическая регистрация клиентов OpenID Connect (RFC 7591) с начальным токеном и модерацией. */
describeDb('OIDC: динамическая регистрация клиентов (RFC 7591)', () => {
  let ctx: V2App;
  let admin: Agent;
  let token: string;
  let tokenId: string;
  const good = {
    client_name: 'Журнал успеваемости',
    redirect_uris: ['https://app.example.org/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    scope: 'openid profile email',
  };

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!, {
      OIDC_DYNAMIC_REGISTRATION: 'true',
      OIDC_REGISTRATION_ALLOWED_HOSTS: 'app.example.org',
    });
    admin = ctx.agent();
    await loginStaff(admin);
  });

  afterAll(async () => {
    await (ctx as V2App | undefined)?.close();
  });

  it('обнаружение объявляет registration_endpoint; администратор выпускает начальный токен', async () => {
    const d = await ctx.agent().get('/.well-known/openid-configuration').expect(200);
    expect(d.body.registration_endpoint).toMatch(/\/oidc\/register$/);
    const r = await admin
      .post(`${API}/admin/oauth-clients/initial-tokens`)
      .send({ note: 'кафедра', uses: 1 })
      .expect(201);
    expect(r.body.token).toMatch(/^iat_/);
    token = r.body.token as string;
    tokenId = r.body.id as string;
    const stored = await ctx.pg.query('SELECT token_hash FROM oauth_initial_token');
    expect(stored.rows[0].token_hash).not.toContain(token); // в базе только хэш
  });

  it('проверки: токен, адреса возврата, scope; ошибка метаданных не тратит токен', async () => {
    const reg = (body: object, bearer?: string) => {
      const q = ctx.agent().post('/oidc/register').send(body);
      return bearer ? q.set('Authorization', `Bearer ${bearer}`) : q;
    };
    const noTok = await reg(good).expect(401);
    expect(noTok.body.error).toBe('invalid_token');
    for (const uri of [
      'http://app.example.org/cb',
      'https://evil.example/cb',
      'https://app.example.org/cb#x',
      'not a url',
    ]) {
      const r = await reg({ ...good, redirect_uris: [uri] }, token).expect(400);
      expect(r.body.error).toBe('invalid_redirect_uri');
    }
    expect((await reg({ ...good, scope: 'openid roles' }, token).expect(400)).body.error).toBe(
      'invalid_client_metadata',
    );
    expect((await reg({ ...good, grant_types: ['client_credentials'] }, token).expect(400)).body.error).toBe(
      'invalid_client_metadata',
    );
  });

  it('регистрация: клиент выключен до проверки; токен одноразовый; включение администратором снимает модерацию', async () => {
    const r = await ctx
      .agent()
      .post('/oidc/register')
      .set('Authorization', `Bearer ${token}`)
      .send(good)
      .expect(201);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.body).toMatchObject({
      client_name: 'Журнал успеваемости',
      token_endpoint_auth_method: 'client_secret_basic',
      scope: 'openid profile email',
      bioauth_status: 'pending_review',
      client_secret_expires_at: 0,
    });
    expect(r.body.client_id).toMatch(/^dyn-/);
    expect(typeof r.body.client_secret).toBe('string');
    const again = await ctx
      .agent()
      .post('/oidc/register')
      .set('Authorization', `Bearer ${token}`)
      .send(good)
      .expect(401);
    expect(again.body.error).toBe('invalid_token');

    const id = r.body.client_id as string;
    const list = await admin.get(`${API}/admin/oauth-clients`).expect(200);
    expect(list.body.find((c: { clientId: string }) => c.clientId === id)).toMatchObject({
      disabled: true,
      pendingReview: true,
      firstParty: false,
      grantTypes: ['authorization_code', 'refresh_token'],
    });
    // Выключенный клиент не может начать авторизацию.
    const auth = await ctx
      .agent()
      .get(
        `/oidc/authorize?client_id=${id}&redirect_uri=${encodeURIComponent(good.redirect_uris[0]!)}&response_type=code&scope=openid&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256`,
      );
    // Ошибка показывается на странице BioAuth, а не отправляется на адрес клиента.
    expect(auth.headers.location ?? '').not.toContain('app.example.org');
    expect(auth.headers.location ?? '').toContain('invalid_client');

    const en = await admin.patch(`${API}/admin/oauth-clients/${id}`).send({ disabled: false }).expect(200);
    // PATCH без поля не трогает его (раньше значения по умолчанию стирали адреса возврата).
    expect(en.body.client.redirectUris).toEqual(good.redirect_uris);
    const after = await admin.get(`${API}/admin/oauth-clients`).expect(200);
    expect(after.body.find((c: { clientId: string }) => c.clientId === id)).toMatchObject({
      disabled: false,
      pendingReview: false,
    });

    const tokens = await admin.get(`${API}/admin/oauth-clients/initial-tokens`).expect(200);
    expect(tokens.body[0]).toMatchObject({ id: tokenId, usesLeft: 0, note: 'кафедра' });
    await admin.delete(`${API}/admin/oauth-clients/initial-tokens/${tokenId}`).expect(204);
    const audit = await ctx.pg.query(
      "SELECT action FROM audit_event WHERE action LIKE 'oauth.%' ORDER BY seq",
    );
    expect(audit.rows.map((x: { action: string }) => x.action)).toEqual(
      expect.arrayContaining([
        'oauth.initial_token_created',
        'oauth.client_registered',
        'oauth.initial_token_deleted',
      ]),
    );
  });
});
