import { type Agent, createV2App, loginStaff, registerSubject, type V2App } from '../support/v2-app';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;
const API = '/api/v1';

/** v3.4: брендинг страницы входа, выключение регистрации и входа с телефона, выгрузка пользователей. */
describeDb('Настройки тенанта и выгрузка пользователей', () => {
  let ctx: V2App;
  let admin: Agent;

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    admin = ctx.agent();
    await loginStaff(admin);
  });

  afterAll(async () => {
    await ctx.pg.query('UPDATE tenant_settings SET allow_signup = true, allow_cross_device = true');
    await (ctx as V2App | undefined)?.close();
  });

  it('настройки читаются без входа; по умолчанию регистрация и вход с телефона открыты', async () => {
    const r = await ctx.agent().get(`${API}/tenant/settings`).expect(200);
    expect(r.body).toMatchObject({ productName: 'BioAuth', allowSignup: true, allowCrossDevice: true });
  });

  it('менять может только администратор; пустая строка сбрасывает поле; неверные значения — 400', async () => {
    const guest = ctx.agent();
    await guest.patch(`${API}/admin/tenant/settings`).send({ productName: 'X' }).expect(401);
    const subj = ctx.agent();
    await registerSubject(subj, 'tenant-subj', false);
    await subj.patch(`${API}/admin/tenant/settings`).send({ productName: 'X' }).expect(403);

    await admin.patch(`${API}/admin/tenant/settings`).send({ accentColor: 'red' }).expect(400);
    await admin.patch(`${API}/admin/tenant/settings`).send({ logoUrl: 'http://x.org/l.png' }).expect(400);
    await admin.patch(`${API}/admin/tenant/settings`).send({ unknown: 1 }).expect(400);

    const r = await admin
      .patch(`${API}/admin/tenant/settings`)
      .send({ productName: 'Кафедра ИБ', accentColor: '#1F6FEB', loginTitle: 'Добро пожаловать' })
      .expect(200);
    expect(r.body).toMatchObject({
      productName: 'Кафедра ИБ',
      accentColor: '#1f6feb',
      loginTitle: 'Добро пожаловать',
    });
    expect(r.body.updatedAt).toEqual(expect.any(String));
    const cleared = await admin.patch(`${API}/admin/tenant/settings`).send({ loginTitle: '' }).expect(200);
    expect(cleared.body.loginTitle).toBeNull();

    const audit = await ctx.pg.query(
      "SELECT details FROM audit_event WHERE action = 'tenant.updated' ORDER BY seq DESC LIMIT 1",
    );
    expect(audit.rows[0].details).toEqual({ changed: ['loginTitle'] });
  });

  it('выключенная регистрация и вход с телефона отклоняются сервером', async () => {
    await admin
      .patch(`${API}/admin/tenant/settings`)
      .send({ allowSignup: false, allowCrossDevice: false })
      .expect(200);
    const r = await ctx
      .agent()
      .post(`${API}/identity/subjects`)
      .send({ login: 'tenant-closed', displayName: 'Closed' })
      .expect(403);
    expect(r.body.detail).toMatch(/регистрация выключена/);
    await ctx.agent().post(`${API}/cross-device`).expect(403);

    await admin
      .patch(`${API}/admin/tenant/settings`)
      .send({ allowSignup: true, allowCrossDevice: true })
      .expect(200);
    await ctx
      .agent()
      .post(`${API}/identity/subjects`)
      .send({ login: 'tenant-open', displayName: 'Open' })
      .expect(201);
  });

  it('выгрузка пользователей: CSV с фильтром и защитой от формул, JSON; аудитор — можно, участник — нет', async () => {
    const csv = await admin.get(`${API}/admin/users/export?role=subject`).expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(/users-\d{4}-\d{2}-\d{2}\.csv/);
    const lines = csv.text
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\n');
    expect(lines[0]).toBe(
      'id,login,displayName,email,role,createdAt,lastLoginAt,disabled,lockedUntil,face,passkeys,consent,activeSessions',
    );
    expect(lines.slice(1).every((l) => l.includes(',subject,'))).toBe(true);
    expect(lines.some((l) => l.includes('tenant-open'))).toBe(true);

    const json = await admin.get(`${API}/admin/users/export?format=json&q=tenant-`).expect(200);
    expect(json.body.map((u: { login: string }) => u.login).sort()).toEqual(['tenant-open', 'tenant-subj']);

    const subj = ctx.agent();
    await registerSubject(subj, 'tenant-subj2', false);
    await subj.get(`${API}/admin/users/export`).expect(403);
  });
});
