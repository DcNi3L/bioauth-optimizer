import { base32Decode, hotp, totpCounter } from '../../src/modules/mfa/domain/totp';
import { type Agent, createV2App, loginStaff, registerSubject, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;

const API = '/api/v1';
const STEP_MS = 30_000;
/** Операция с @RequireMfa: без завершённого входа — 403 до проверки тела, с ним — 400 (тело пустое). */
const mfaGate = (a: Agent) => a.post(`${API}/admin/oauth-clients`).send({});

describeDb('API: приложение-аутентификатор (TOTP) и коды восстановления', () => {
  let ctx: V2App;
  let base: number;
  let secret: Buffer;
  let recovery: string[];
  const spy = jest.spyOn(Date, 'now');
  /** Код TOTP на момент «now + offset шагов»; часы сервиса идут вместе с тестом. */
  const code = (steps: number) => hotp(secret, totpCounter(base) + steps);
  const at = (steps: number) => spy.mockReturnValue(base + steps * STEP_MS);
  const nowReal = Date.now.bind(Date);

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!, { REQUIRE_STAFF_PASSKEY: 'true' });
    base = nowReal();
    at(0);
  });

  afterAll(async () => {
    spy.mockRestore();
    await (ctx as V2App | undefined)?.close();
  });

  it('сотрудник без второго фактора не получает доступ к админке; TOTP его заменяет passkey', async () => {
    const a: Agent = ctx.agent();
    const r = await a
      .post(`${API}/identity/login`)
      .send({ login: 'admin', password: 'admin-password-123' })
      .expect(200);
    expect(r.body).toEqual({ mfaRequired: true });
    await mfaGate(a).expect(403);

    const setup = await a.post(`${API}/mfa/totp/setup`).expect(200);
    expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
    secret = base32Decode(setup.body.secret as string);

    await a.post(`${API}/mfa/totp/confirm`).send({ code: '000000' }).expect(401);
    const ok = await a
      .post(`${API}/mfa/totp/confirm`)
      .send({ code: code(0) })
      .expect(200);
    expect(ok.body.enabled).toBe(true);
    recovery = ok.body.recoveryCodes as string[];
    expect(recovery).toHaveLength(10);

    await mfaGate(a).expect(400); // MFA завершён в этой же сессии
    const me = await a.get(`${API}/identity/me`).expect(200);
    expect(me.body.totp).toBe(true);
    expect(me.body.amr).toEqual(expect.arrayContaining(['pwd', 'otp', 'mfa']));
    const st = await a.get(`${API}/mfa`).expect(200);
    expect(st.body).toMatchObject({ totp: { enabled: true }, recoveryCodesLeft: 10 });

    // Повторный запрос секрета при включённом факторе отклоняется.
    await a.post(`${API}/mfa/totp/setup`).expect(409);
  });

  it('вход: пароль → код из приложения; повтор того же кода отклоняется', async () => {
    at(1);
    const a = ctx.agent();
    await loginStaff(a);
    await mfaGate(a).expect(403);
    await a.post(`${API}/mfa/totp/verify`).send({ code: '123456' }).expect(401);
    await a
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(1) })
      .expect(200);
    await mfaGate(a).expect(400);

    const b = ctx.agent();
    await loginStaff(b);
    await b
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(1) })
      .expect(401); // шаг уже использован
    await mfaGate(b).expect(403);
  });

  it('пять неверных кодов подряд блокируют проверку, верный код тоже не проходит', async () => {
    at(5);
    const a = ctx.agent();
    await loginStaff(a);
    await a
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(5) })
      .expect(200); // успех обнуляет счётчик неудач
    for (let i = 0; i < 4; i++) await a.post(`${API}/mfa/totp/verify`).send({ code: '111111' }).expect(401);
    const locked = await a.post(`${API}/mfa/totp/verify`).send({ code: '111111' });
    expect(locked.status).toBe(429);
    await a
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(6) })
      .expect(429);
    // Через 5 минут блокировка снимается.
    at(5 + 11);
    await a
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(5 + 11) })
      .expect(200);
    const hist = await a.get(`${API}/identity/login-history`).expect(200);
    expect(JSON.stringify(hist.body)).toContain('TOTP_INVALID');
    expect(JSON.stringify(hist.body)).toContain('"totp"');
  });

  it('код восстановления: вход, повторное использование отклоняется, счётчик уменьшается', async () => {
    at(30);
    const a = ctx.agent();
    await loginStaff(a);
    await a.post(`${API}/mfa/recovery/verify`).send({ code: 'AAAAA-AAAAA' }).expect(401);
    const lower = recovery[0]!.toLowerCase().replace('-', ' ');
    const r = await a.post(`${API}/mfa/recovery/verify`).send({ code: lower }).expect(200);
    expect(r.body).toEqual({ mfaComplete: true, recoveryCodesLeft: 9 });
    await mfaGate(a).expect(400);

    const b = ctx.agent();
    await loginStaff(b);
    await b.post(`${API}/mfa/recovery/verify`).send({ code: recovery[0] }).expect(401);
    await mfaGate(b).expect(403);
  });

  it('перевыпуск кодов и отключение требуют действующего кода; отключение удаляет коды', async () => {
    at(60);
    const a = ctx.agent();
    await loginStaff(a);
    await a
      .post(`${API}/mfa/totp/verify`)
      .send({ code: code(60) })
      .expect(200);

    await a.post(`${API}/mfa/recovery/regenerate`).send({ code: '000000' }).expect(401);
    at(62);
    const fresh = await a
      .post(`${API}/mfa/recovery/regenerate`)
      .send({ code: code(62) })
      .expect(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);
    const old = ctx.agent();
    await loginStaff(old);
    await old.post(`${API}/mfa/recovery/verify`).send({ code: recovery[1] }).expect(401); // старый набор аннулирован

    await a.delete(`${API}/mfa/totp`).send({ code: '000000' }).expect(401);
    at(64);
    await a
      .delete(`${API}/mfa/totp`)
      .send({ code: code(64) })
      .expect(204);
    const st = await a.get(`${API}/mfa`).expect(200);
    expect(st.body).toEqual({ totp: { enabled: false, confirmedAt: null }, recoveryCodesLeft: 0 });
    const { rows } = await ctx.pg.query(
      "SELECT action FROM audit_event WHERE action LIKE 'totp.%' OR action LIKE 'recovery.%' ORDER BY seq",
    );
    expect(rows.map((x: { action: string }) => x.action)).toEqual(
      expect.arrayContaining(['totp.enabled', 'recovery.generated', 'recovery.used', 'totp.disabled']),
    );
  });

  it('секрет в базе зашифрован и не совпадает с открытым', async () => {
    at(100);
    const a = ctx.agent();
    await loginStaff(a);
    const setup = await a.post(`${API}/mfa/totp/setup`).expect(200);
    const plain = base32Decode(setup.body.secret as string);
    const { rows } = await ctx.pg.query<{ secret_enc: Buffer }>('SELECT secret_enc FROM user_totp');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secret_enc.includes(plain)).toBe(false);
    expect(rows[0]!.secret_enc.length).toBe(plain.length + 16); // + тег GCM
  });

  it('участник (subject) может включить TOTP, но без завершения MFA-доступа в админку', async () => {
    const s = ctx.agent();
    await registerSubject(s, 'subj-totp', false);
    const setup = await s.post(`${API}/mfa/totp/setup`).expect(200);
    const sec = base32Decode(setup.body.secret as string);
    at(110);
    const ok = await s
      .post(`${API}/mfa/totp/confirm`)
      .send({ code: hotp(sec, totpCounter(base) + 110) })
      .expect(200);
    expect(ok.body.enabled).toBe(true);
    await s.get(`${API}/admin/users`).expect(403); // роль участника не допускает админку
  });
});
