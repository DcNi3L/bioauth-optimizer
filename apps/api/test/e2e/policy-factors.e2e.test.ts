import { base32Decode, hotp, totpCounter } from '../../src/modules/mfa/domain/totp';
import { profile, rng, typing } from '../support/typing';
import {
  type Agent,
  createV2App,
  loginStaff,
  normalSamples,
  registerSubject,
  type V2App,
} from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;
const API = '/api/v1';
const MODEL = 'keystroke-sm-v1';

/** #48: «код из приложения» и «ритм набора» как шаги политики входа — вход без камеры. */
describeDb('API: шаги политики TOTP и ритм набора (#48)', () => {
  let ctx: V2App;
  let admin: Agent;
  const n = rng(7);
  const mine = profile(21);
  const secrets = new Map<string, Buffer>();
  let step = 0;
  /** Каждый код — из нового 30-секундного шага: часы сервиса сдвигаются вместе с тестом. */
  const spy = jest.spyOn(Date, 'now');
  const base = Date.now();
  const nextCode = (login: string) => {
    step += 2;
    spy.mockReturnValue(base + step * 30_000);
    return hotp(secrets.get(login)!, totpCounter(base) + step);
  };

  async function subject(login: string, p = mine, totp = true): Promise<void> {
    const a = ctx.agent();
    await registerSubject(a, login, false); // без лица: вход должен работать без камеры
    const samples = Array.from({ length: 5 }, () => typing(p, n));
    await a.post(`${API}/keystroke/enroll`).send({ samples }).expect(201);
    if (!totp) return;
    const setup = await a.post(`${API}/mfa/totp/setup`).expect(200);
    secrets.set(login, base32Decode(setup.body.secret as string));
    await a
      .post(`${API}/mfa/totp/confirm`)
      .send({ code: nextCode(login) })
      .expect(200);
  }

  async function activate(steps: unknown[]): Promise<void> {
    const p = await admin
      .post(`${API}/policies`)
      .send({ steps, costs: { cFA: 10, cFR: 1 }, rationale: 'тест' })
      .expect(201);
    await admin.post(`${API}/policies/${p.body.id}/approve`).send({}).expect(200);
  }

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    admin = ctx.agent();
    await loginStaff(admin);
    await subject('kd1');
    await subject('kd2', profile(22), false);
    await subject('kd3', profile(23), false);
  });

  afterAll(async () => {
    spy.mockRestore();
    await (ctx as V2App | undefined)?.close();
  });

  it('политика «ритм + код»: вход без камеры, amr kbd+otp+mfa, оценки для калибровки', async () => {
    await activate([{ factor: 'keystroke', tauKd: 1.1, calibrated: false }, { factor: 'totp' }]);
    const a = ctx.agent();
    const s = await a.post(`${API}/auth/sessions`).send({ login: 'kd1' }).expect(201);
    expect(s.body.steps).toEqual([
      { factor: 'keystroke', phrase: 'the quick brown fox' },
      { factor: 'totp' },
    ]);
    const id = s.body.sessionId as string;

    // Шаги — строго по порядку политики.
    await a.post(`${API}/auth/sessions/${id}/totp`).send({ code: '123456' }).expect(409);
    const kd = await a.post(`${API}/auth/sessions/${id}/keystroke`).send(typing(mine, n)).expect(200);
    expect(kd.body).toMatchObject({ outcome: 'continue', currentStep: 1 });

    const wrong = await a.post(`${API}/auth/sessions/${id}/totp`).send({ code: '000000' }).expect(200);
    expect(wrong.body).toMatchObject({ outcome: 'retry', reason: 'TOTP_FAILED', attemptsLeft: 2 });
    const ok = await a
      .post(`${API}/auth/sessions/${id}/totp`)
      .send({ code: nextCode('kd1') })
      .expect(200);
    expect(ok.body.outcome).toBe('accepted');
    expect(ok.headers['set-cookie']?.[0]).toMatch(/bioauth_session=/);

    const me = await a.get(`${API}/identity/me`).expect(200);
    expect(me.body.amr).toEqual(expect.arrayContaining(['kbd', 'otp', 'mfa']));
    const ev = await ctx.pg.query('SELECT method FROM login_event WHERE success ORDER BY at DESC LIMIT 1');
    expect(ev.rows[0].method).toBe('keystroke');

    await ctx.drain();
    const samples = await ctx.pg.query<{ kind: string; source: string; n: number }>(
      "SELECT kind, source, count(*)::int AS n FROM score_sample WHERE modality = 'keystroke' GROUP BY kind, source ORDER BY kind",
    );
    expect(samples.rows).toEqual([
      { kind: 'genuine', source: 'login', n: 1 },
      { kind: 'impostor', source: 'cross', n: 2 }, // против шаблонов kd2 и kd3 с той же фразой
    ]);
    const attempts = await ctx.pg.query(
      'SELECT factor, outcome, reject_reason FROM auth_attempt WHERE session_id = $1 ORDER BY created_at',
      [id],
    );
    expect(attempts.rows.map((r: { factor: string; outcome: string }) => `${r.factor}:${r.outcome}`)).toEqual(
      ['keystroke:accept', 'totp:reject', 'totp:accept'],
    );
  });

  it('чужой ритм — отказ; неточная фраза — повтор без блокировки; неизвестный логин не раскрывается', async () => {
    const a = ctx.agent();
    const s = await a.post(`${API}/auth/sessions`).send({ login: 'kd1' }).expect(201);
    const id = s.body.sessionId as string;
    const bad = typing(mine, n);
    bad.events[2]!.code = 'KeyZ';
    const typo = await a.post(`${API}/auth/sessions/${id}/keystroke`).send(bad).expect(200);
    expect(typo.body).toMatchObject({ outcome: 'retry', reason: 'KEYSTROKE_INPUT' });
    const other = await a
      .post(`${API}/auth/sessions/${id}/keystroke`)
      .send(typing(profile(99), n))
      .expect(200);
    expect(other.body).toMatchObject({ outcome: 'retry', reason: 'KEYSTROKE_NO_MATCH' });
    const u = await ctx.pg.query("SELECT failed_attempts FROM app_user WHERE login = 'kd1'");
    expect(u.rows[0].failed_attempts).toBe(1); // опечатка в блокировку не засчитана

    const ghost = await a.post(`${API}/auth/sessions`).send({ login: 'nobody' }).expect(201);
    expect(ghost.body.steps[0]).toEqual({ factor: 'keystroke', phrase: 'the quick brown fox' });
    const r = await a
      .post(`${API}/auth/sessions/${ghost.body.sessionId}/keystroke`)
      .send(typing(mine, n))
      .expect(200);
    expect(r.body).toMatchObject({ outcome: 'retry', reason: 'NOT_ENROLLED' });
  });

  it('калибровка τ_kd по оценкам и предложение политики; измеренный каталог включает TOTP и ритм', async () => {
    const insert = async (kind: string, scores: number[]) => {
      for (const sc of scores) {
        await ctx.pg.query(
          "INSERT INTO score_sample (modality, kind, score, model_version, source) VALUES ('keystroke', $1, $2, $3, 'login')",
          [kind, Math.min(1, Math.max(0, sc)), MODEL],
        );
      }
    };
    await insert('genuine', normalSamples(40, 0.8, 0.06, 1));
    await insert('impostor', normalSamples(60, 0.45, 0.08, 2));
    const t = await admin
      .post(`${API}/calibration/threshold`)
      .send({ modality: 'keystroke', modelVersion: MODEL })
      .expect(200);
    expect(t.body.current.tau).toBeCloseTo(1 - 1.1 / 4, 9); // τ_kd 1,1 в шкале оценок
    const tau = t.body.threshold.optimal.tau as number;
    const p = await admin
      .post(`${API}/calibration/propose`)
      .send({ keystrokeExperimentId: t.body.threshold.experimentId })
      .expect(201);
    expect(p.body.steps[0]).toMatchObject({ factor: 'keystroke', calibrated: true });
    expect(p.body.steps[0].tauKd).toBeCloseTo(4 * (1 - tau), 9);
    expect(p.body.rationale).toMatch(/τ_kd/);
    await admin
      .post(`${API}/calibration/propose`)
      .send({ faceExperimentId: t.body.threshold.experimentId })
      .expect(422); // в активной политике нет шага «лицо»

    const m = await admin.get(`${API}/calibration/factors`).expect(200);
    const codes = m.body.factors.map((f: { code: string }) => f.code);
    expect(codes).toEqual(expect.arrayContaining(['TOTP', 'KEYSTROKE']));
    const ov = await admin.get(`${API}/calibration/overview`).expect(200);
    expect(ov.body.activePolicy.tauKd).toBe(1.1);
  });

  it('политика из решения оптимизатора: состав «ритм + TOTP» → шаги; неподдерживаемый фактор — 422', async () => {
    const f = (code: string, far: number, frr: number, cost: number) => ({
      code,
      name: code,
      far,
      frr,
      latencyMs: 3000,
      cost,
      hasPad: false,
    });
    const sel = await admin
      .post(`${API}/factor-selection/solve`)
      .send({
        factors: [f('TOTP', 3e-6, 0.05, 1), f('KEYSTROKE', 0.05, 0.08, 0.5)],
        costs: { cFA: 10, cFR: 1 },
        constraints: { farMax: 2e-7, minPadFactors: 0 },
      })
      .expect(200);
    expect([...sel.body.optimum.codes].sort()).toEqual(['KEYSTROKE', 'TOTP']);
    const p = await admin
      .post(`${API}/calibration/propose-from-selection`)
      .send({ experimentId: sel.body.experimentId })
      .expect(201);
    expect(p.body.steps.map((s: { factor: string }) => s.factor)).toEqual(['keystroke', 'totp']);
    expect(p.body.experimentId).toBe(sel.body.experimentId);

    const iris = await admin
      .post(`${API}/factor-selection/solve`)
      .send({
        factors: [f('IRIS', 1e-4, 0.02, 1)],
        costs: { cFA: 10, cFR: 1 },
        constraints: { minPadFactors: 0 },
      })
      .expect(200);
    const r = await admin
      .post(`${API}/calibration/propose-from-selection`)
      .send({ experimentId: iris.body.experimentId })
      .expect(422);
    expect(r.body.code).toBe('UNSUPPORTED_FACTOR');
  });
});
