import type { INestApplication } from '@nestjs/common';
import { join } from 'node:path';
import { Client } from 'pg';
import request from 'supertest';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) {
  // В CI e2e обязательны: без базы тесты не должны молча пропускаться.
  throw new Error('TEST_DATABASE_URL не задана в CI');
}
const describeDb = DB_URL ? describe : describe.skip;

/** E2E на реальном PostgreSQL: TEST_DATABASE_URL (в CI — сервис postgres). Схема пересоздаётся с нуля. */
describeDb('API e2e (PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  beforeAll(async () => {
    const client = new Client({ connectionString: DB_URL });
    await client.connect();
    await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await client.end();
    process.env.DATABASE_URL = DB_URL;
    process.env.LOG_LEVEL = 'silent';
    process.env.NODE_ENV = 'test';
    const { migrate } = await import('../../src/shared/database/migrator');
    const { createDb } = await import('../../src/shared/database/kysely');
    const { seedPresetCatalogs } = await import('../../src/modules/factor-catalogs/infrastructure/seed-presets');
    await migrate(DB_URL!, join(__dirname, '..', '..', 'migrations'));
    const db = createDb(DB_URL!, 1);
    expect(await seedPresetCatalogs(db)).toBe(true);
    expect(await seedPresetCatalogs(db)).toBe(false); // идемпотентность
    await db.destroy();
    const { createApp } = await import('../../src/bootstrap');
    app = await createApp();
    await app.init();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app?.close();
  });

  it('health: live и ready', async () => {
    await http.get('/health/live').expect(200);
    const r = await http.get('/health/ready').expect(200);
    expect(r.body.database).toBe('up');
  });

  it('порог: пример статьи СРО1', async () => {
    const ex = (await http.get('/api/v1/examples/sro1').expect(200)).body;
    const r = await http.post('/api/v1/threshold/optimize').send(ex.threshold).expect(200);
    expect(r.body.optimal.tau).toBeCloseTo(0.581785716220834, 9);
    expect(r.body.lossReduction).toBeCloseTo(0.41790539, 8);
    expect(r.body.verification.status).toBe('ok');
    expect(r.body.curves.errors).toHaveLength(201);
    expect(r.headers['x-request-id']).toBeDefined();
  });

  it('состав факторов по предустановленному каталогу и анализ бюджета', async () => {
    const catalogs = (await http.get('/api/v1/factor-catalogs').expect(200)).body.items;
    const preset = catalogs.find((c: { isPreset: boolean }) => c.isPreset);
    expect(preset.factors).toHaveLength(5);
    const body = {
      catalogId: preset.id,
      costs: { cFA: 10, cFR: 1 },
      constraints: { latencyMaxMs: 1000, budget: 2.5, farMax: 1e-6, minPadFactors: 1 },
    };
    const a = await http.post('/api/v1/factor-selection/solve').send(body).expect(200);
    expect(a.body.optimum.codes).toEqual(['F2', 'F5']);
    expect(a.body.stats.feasibleCount).toBe(6);
    const b = await http.post('/api/v1/factor-selection/solve').send({ ...body, solver: 'ilp' }).expect(200);
    expect(b.body.solver.certificate).toMatchObject({ iterations: 2, proven: true });
    const { budget: _budget, ...constraints } = body.constraints;
    const s = await http
      .post('/api/v1/factor-selection/budget-sweep')
      .send({ ...body, constraints, sweep: { from: 0.5, to: 3, step: 0.1 } })
      .expect(200);
    expect(s.body.breakpoints.map((p: { budget: number }) => p.budget)).toEqual([0.5, 0.9, 1.6, 2.1]);
  });

  it('ошибки в формате RFC 7807', async () => {
    const v = await http.post('/api/v1/threshold/optimize').send({ model: { kind: 'gaussian' } }).expect(400);
    expect(v.headers['content-type']).toContain('application/problem+json');
    expect(v.body.type).toMatch(/validation-error$/);
    expect(v.body.errors.length).toBeGreaterThan(0);
    await http.get('/api/v1/experiments/not-a-uuid').expect(400);
    await http.get('/api/v1/experiments/3f2504e0-4f89-41d3-9a0c-0305e82c3301').expect(404);
    const factors = Array.from({ length: 21 }, (_, i) => ({
      code: `X${i}`,
      name: 'x',
      far: 0.1,
      frr: 0.01,
      latencyMs: 1,
      cost: 1,
      hasPad: true,
    }));
    const big = await http
      .post('/api/v1/factor-selection/solve')
      .send({ factors, costs: { cFA: 1, cFR: 1 }, constraints: {}, solver: 'exhaustive' })
      .expect(413);
    expect(big.body.type).toMatch(/problem-too-large$/);
  });

  it('каталоги: CRUD, предустановленный — только чтение, уникальность имени', async () => {
    const factor = { code: 'K', name: 'Ключ', far: 1e-3, frr: 0.01, latencyMs: 10, cost: 0.1, hasPad: false };
    const created = await http.post('/api/v1/factor-catalogs').send({ name: 'Мой каталог', factors: [factor] }).expect(201);
    await http.post('/api/v1/factor-catalogs').send({ name: 'Мой каталог', factors: [factor] }).expect(409);
    const updated = await http
      .put(`/api/v1/factor-catalogs/${created.body.id}`)
      .send({ name: 'Мой каталог 2', factors: [factor, { ...factor, code: 'P' }] })
      .expect(200);
    expect(updated.body.factors.map((f: { code: string }) => f.code)).toEqual(['K', 'P']);
    const preset = (await http.get('/api/v1/factor-catalogs')).body.items.find((c: { isPreset: boolean }) => c.isPreset);
    await http.delete(`/api/v1/factor-catalogs/${preset.id}`).expect(409);
    await http.delete(`/api/v1/factor-catalogs/${created.body.id}`).expect(204);
    await http.get(`/api/v1/factor-catalogs/${created.body.id}`).expect(404);
  });

  it('CSV: загрузка, идемпотентность по содержимому, эмпирический порог', async () => {
    const csv =
      'score,label\n' +
      [0.6, 0.7, 0.8].map((s) => `${s},genuine`).join('\n') +
      '\n' +
      [0.1, 0.2, 0.3].map((s) => `${s},impostor`).join('\n');
    const up = await http.post('/api/v1/score-datasets').attach('file', Buffer.from(csv), 'demo.csv').expect(201);
    expect(up.body).toMatchObject({ genuineCount: 3, impostorCount: 3, name: 'demo' });
    const again = await http.post('/api/v1/score-datasets').attach('file', Buffer.from(csv), 'demo.csv').expect(201);
    expect(again.body.id).toBe(up.body.id);
    const r = await http
      .post('/api/v1/threshold/optimize')
      .send({ model: { kind: 'empirical', datasetId: up.body.id }, costs: { cFA: 1, cFR: 1 } })
      .expect(200);
    expect(r.body.optimal.interval).toEqual([0.3, 0.6]);
    expect(r.body.verification.status).toBe('exact');
    const bad = await http
      .post('/api/v1/score-datasets')
      .attach('file', Buffer.from('score,label\nx,genuine'), 'bad.csv')
      .expect(400);
    expect(bad.body.detail).toMatch(/строка 2/);
  });

  it('история: фильтр по типу, курсор и полный эксперимент', async () => {
    const list = await http.get('/api/v1/experiments?type=THRESHOLD&limit=1').expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.nextCursor).not.toBeNull();
    const detail = await http.get(`/api/v1/experiments/${list.body.items[0].id}`).expect(200);
    expect(detail.body.input).toBeDefined();
    expect(detail.body.result.method).toBeDefined();
    const page2 = await http.get(`/api/v1/experiments?type=THRESHOLD&limit=1&cursor=${list.body.nextCursor}`).expect(200);
    expect(page2.body.items[0].id).not.toBe(list.body.items[0].id);
  });
});
