import { type Agent, createV2App, registerSubject, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;
const API = '/api/v1';

/** #40: вход на компьютере, подтверждение на телефоне по QR-коду с выбором числа. */
describeDb('API: вход с другого устройства (QR)', () => {
  let ctx: V2App;
  let phone: Agent;

  const start = async (pc: Agent) => {
    const r = await pc.post(`${API}/cross-device`).expect(201);
    const key = new URL(r.body.approveUrl as string).hash.replace('#k=', '');
    return {
      id: r.body.requestId as string,
      poll: r.body.pollSecret as string,
      number: r.body.number as number,
      key,
      url: r.body.approveUrl as string,
    };
  };

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    phone = ctx.agent();
    await registerSubject(phone, 'phone-user', false); // регистрация = свежий вход на телефоне
  });

  afterAll(async () => {
    await (ctx as V2App | undefined)?.close();
  });

  it('полный путь: QR → выбор числа на телефоне → компьютер получает сессию один раз', async () => {
    const pc = ctx.agent();
    const s = await start(pc);
    expect(s.url).toMatch(/\/approve\?r=[0-9a-f-]{36}#k=/); // ключ во фрагменте: не уходит на сервер
    expect(
      (await pc.post(`${API}/cross-device/${s.id}/status`).send({ pollSecret: s.poll }).expect(200)).body,
    ).toEqual({ status: 'pending' });
    await pc.post(`${API}/cross-device/${s.id}/complete`).send({ pollSecret: s.poll }).expect(409);

    const d = await phone.post(`${API}/cross-device/${s.id}/details`).send({ key: s.key }).expect(200);
    expect(d.body.choices).toHaveLength(3);
    expect(d.body.choices).toContain(s.number);
    expect(new Set(d.body.choices).size).toBe(3);
    expect(d.body.needsReauth).toBe(false);
    await phone
      .post(`${API}/cross-device/${s.id}/details`)
      .send({ key: 'x'.repeat(32) })
      .expect(404);

    await phone
      .post(`${API}/cross-device/${s.id}/approve`)
      .send({ key: s.key, number: s.number })
      .expect(204);
    expect(
      (await pc.post(`${API}/cross-device/${s.id}/status`).send({ pollSecret: s.poll }).expect(200)).body
        .status,
    ).toBe('approved');
    await pc
      .post(`${API}/cross-device/${s.id}/complete`)
      .send({ pollSecret: 'y'.repeat(32) })
      .expect(409); // чужой секрет
    const done = await pc
      .post(`${API}/cross-device/${s.id}/complete`)
      .send({ pollSecret: s.poll })
      .expect(204);
    expect(done.headers['set-cookie']?.[0]).toMatch(/bioauth_session=/);
    const me = await pc.get(`${API}/identity/me`).expect(200);
    expect(me.body.login).toBe('phone-user');
    await pc.post(`${API}/cross-device/${s.id}/complete`).send({ pollSecret: s.poll }).expect(409); // повторно — нет

    const ev = await ctx.pg.query('SELECT method FROM login_event WHERE success ORDER BY at DESC LIMIT 1');
    expect(ev.rows[0].method).toBe('cross_device');
    const audit = await ctx.pg.query(
      "SELECT action FROM audit_event WHERE action LIKE 'cross_device.%' ORDER BY seq",
    );
    expect(audit.rows.map((r: { action: string }) => r.action)).toEqual([
      'cross_device.approved',
      'cross_device.completed',
    ]);
  });

  it('неверное число отменяет запрос; «это не я» — тоже; истёкший запрос не подтверждается', async () => {
    const pc = ctx.agent();
    const a = await start(pc);
    const wrong = a.number === 99 ? 98 : a.number + 1;
    const r = await phone
      .post(`${API}/cross-device/${a.id}/approve`)
      .send({ key: a.key, number: wrong })
      .expect(422);
    expect(r.body.code).toBe('NUMBER_MISMATCH');
    expect(
      (await pc.post(`${API}/cross-device/${a.id}/status`).send({ pollSecret: a.poll })).body.status,
    ).toBe('denied');
    await phone
      .post(`${API}/cross-device/${a.id}/approve`)
      .send({ key: a.key, number: a.number })
      .expect(409);

    const b = await start(pc);
    await phone.post(`${API}/cross-device/${b.id}/deny`).send({ key: b.key }).expect(204);
    expect(
      (await pc.post(`${API}/cross-device/${b.id}/status`).send({ pollSecret: b.poll })).body.status,
    ).toBe('denied');

    const c = await start(pc);
    await ctx.pg.query(
      "UPDATE cross_device_request SET expires_at = now() - interval '1 second' WHERE id = $1",
      [c.id],
    );
    expect(
      (await pc.post(`${API}/cross-device/${c.id}/status`).send({ pollSecret: c.poll })).body.status,
    ).toBe('expired');
    await phone
      .post(`${API}/cross-device/${c.id}/approve`)
      .send({ key: c.key, number: c.number })
      .expect(409);
  });

  it('телефон без свежей проверки (вход больше 5 минут назад) — 403 reauth-required', async () => {
    const pc = ctx.agent();
    const s = await start(pc);
    await ctx.pg.query(
      "UPDATE user_session SET created_at = now() - interval '1 hour', mfa_verified_at = NULL WHERE user_id = (SELECT id FROM app_user WHERE login = 'phone-user')",
    );
    const d = await phone.post(`${API}/cross-device/${s.id}/details`).send({ key: s.key }).expect(200);
    expect(d.body.needsReauth).toBe(true);
    const r = await phone
      .post(`${API}/cross-device/${s.id}/approve`)
      .send({ key: s.key, number: s.number })
      .expect(403);
    expect(r.body.code).toBe('reauth-required');
    // Без входа подтверждать нельзя вовсе.
    await ctx
      .agent()
      .post(`${API}/cross-device/${s.id}/approve`)
      .send({ key: s.key, number: s.number })
      .expect(401);
  });
});
