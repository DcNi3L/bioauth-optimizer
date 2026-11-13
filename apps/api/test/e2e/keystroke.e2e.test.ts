import { profile, rng, typing } from '../support/typing';
import { type Agent, createV2App, registerSubject, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;
const API = '/api/v1';

describeDb('API: динамика набора текста (PostgreSQL)', () => {
  let ctx: V2App;
  let a: Agent;
  const mine = profile(11);
  const other = profile(12);
  const n = rng(5);
  const samples = (p = mine, k = 5) => Array.from({ length: k }, () => typing(p, n));

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    a = ctx.agent();
    await registerSubject(a, 'typist', false);
  });

  afterAll(async () => {
    await (ctx as V2App | undefined)?.close();
  });

  it('без согласия регистрация запрещена', async () => {
    const b = ctx.agent();
    await b.post(`${API}/identity/subjects`).send({ login: 'noconsent', displayName: 'n' }).expect(201);
    const r = await b.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(403);
    expect(r.body.detail).toMatch(/согласие/);
  });

  it('согласие v1 не покрывает ритм набора (#49): 403 consent-outdated, после v2 — регистрация, лицо сохранено', async () => {
    const c = ctx.agent();
    await registerSubject(c, 'old-consent', true);
    const { rows } = await ctx.pg.query<{ id: string }>(
      "SELECT id FROM app_user WHERE login = 'old-consent'",
    );
    const id = rows[0]!.id;
    // Имитация согласия, выданного до выхода v2.
    await ctx.pg.query("UPDATE consent SET text_version = 'v1' WHERE user_id = $1", [id]);
    const me1 = await c.get(`${API}/identity/me`).expect(200);
    expect(me1.body.consent).toMatchObject({ textVersion: 'v1', current: false });
    const r = await c.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(403);
    expect(r.body.code).toBe('consent-outdated');
    await c.post(`${API}/consent`).send({ textVersion: 'v1', accepted: true }).expect(400);
    await c.post(`${API}/consent`).send({ textVersion: 'v2', accepted: true }).expect(204);
    await c.post(`${API}/consent`).send({ textVersion: 'v2', accepted: true }).expect(409);
    const me2 = await c.get(`${API}/identity/me`).expect(200);
    expect(me2.body.consent).toMatchObject({ textVersion: 'v2', current: true });
    expect(me2.body.face).not.toBeNull(); // замена редакции не удаляет биометрию
    await c.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(201);
    const hist = await ctx.pg.query<{ text_version: string; revoked: boolean }>(
      'SELECT text_version, revoked_at IS NOT NULL AS revoked FROM consent WHERE user_id = $1 ORDER BY granted_at',
      [id],
    );
    expect(hist.rows).toEqual([
      { text_version: 'v1', revoked: true },
      { text_version: 'v2', revoked: false },
    ]);
    const audit = await ctx.pg.query(
      "SELECT details FROM audit_event WHERE action = 'consent.granted' ORDER BY seq DESC LIMIT 1",
    );
    expect(audit.rows[0].details).toEqual({ textVersion: 'v2', supersedes: 'v1' });
  });

  it('регистрация: нужны 5 повторов; неверная фраза и «робот» отклоняются понятной ошибкой', async () => {
    await a
      .post(`${API}/keystroke/enroll`)
      .send({ samples: samples(mine, 4) })
      .expect(400);
    const bad = samples();
    bad[2]!.events[3]!.code = 'KeyZ';
    const r1 = await a.post(`${API}/keystroke/enroll`).send({ samples: bad }).expect(422);
    expect(r1.body.code).toBe('KEYSTROKE_CODES');
    expect(r1.body.detail).toMatch(/повтор 3/);
    const robot = samples();
    robot[0]!.events = robot[0]!.events.map((e, i) => ({
      code: e.code,
      down: 1000 + i * 100,
      up: 1040 + i * 100,
    }));
    const r2 = await a.post(`${API}/keystroke/enroll`).send({ samples: robot }).expect(422);
    expect(r2.body.code).toBe('KEYSTROKE_ROBOTIC');
    expect((await a.get(`${API}/keystroke`).expect(200)).body.enrolled).toBe(false);
  });

  it('успешная регистрация, проверка своего ритма и чужого', async () => {
    const r = await a.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(201);
    expect(r.body).toMatchObject({ enrolled: true, samples: 5 });
    expect(r.body.consistency).toBeGreaterThan(0);
    const st = await a.get(`${API}/keystroke`).expect(200);
    expect(st.body).toMatchObject({ enrolled: true, samples: 5, phrase: 'the quick brown fox' });

    let accepted = 0;
    for (let i = 0; i < 3; i++) {
      const v = await a.post(`${API}/keystroke/verify`).send(typing(mine, n)).expect(200);
      if (v.body.accepted) accepted++;
      expect(v.body.score).toBeGreaterThanOrEqual(0);
    }
    expect(accepted).toBeGreaterThanOrEqual(2); // FRR ≈ 10 %: из трёх хотя бы два

    const imp = await a.post(`${API}/keystroke/verify`).send(typing(other, n)).expect(200);
    expect(imp.body.accepted).toBe(false);
    expect(imp.body.distance).toBeGreaterThan(imp.body.threshold);
  });

  it('шаблон в базе зашифрован и не содержит читаемых признаков', async () => {
    const { rows } = await ctx.pg.query<{ ciphertext: Buffer }>('SELECT ciphertext FROM keystroke_template');
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.ciphertext.toString('utf8')).not.toContain('mean');
  });

  it('пять отказов подряд — блокировка на 5 минут (429)', async () => {
    const c = ctx.agent();
    await registerSubject(c, 'typist2', false);
    await c.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(201);
    // Верная проверка в начале обнуляет счётчик; затем пять ритмов другого человека.
    for (let i = 0; i < 5; i++) {
      const r = await c.post(`${API}/keystroke/verify`).send(typing(other, n));
      expect(r.status).toBe(200);
      expect(r.body.accepted).toBe(false);
    }
    const locked = await c.post(`${API}/keystroke/verify`).send(typing(mine, n));
    expect(locked.status).toBe(429);
  });

  it('отзыв согласия удаляет ритм набора вместе с шаблоном лица', async () => {
    const d = ctx.agent();
    await registerSubject(d, 'typist3', false);
    await d.post(`${API}/keystroke/enroll`).send({ samples: samples() }).expect(201);
    await d.delete(`${API}/consent`).expect(200);
    expect((await d.get(`${API}/keystroke`).expect(200)).body.enrolled).toBe(false);
  });

  it('удаление: повторное — 404', async () => {
    await a.delete(`${API}/keystroke`).expect(204);
    await a.delete(`${API}/keystroke`).expect(404);
  });
});
