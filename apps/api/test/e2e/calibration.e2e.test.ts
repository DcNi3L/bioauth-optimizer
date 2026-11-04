import { type BatchJobDto, batchJobSchema } from '@bioauth/contracts';

import { frame } from '../support/fake-bio-engine';
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

const MODEL = 'fake-sface+fake-yunet';

/**
 * Замкнутый контур v2.2 на PostgreSQL: накопленные оценки → калибровка ядром v1 → эксперимент →
 * предложение и утверждение политики; измеренный каталог → решатель v1; испытание PAD; дрейф; журнал попыток.
 */
describeDb('API v2.2 e2e: калибровка, PAD, дрейф (PostgreSQL)', () => {
  let ctx: V2App;
  let admin: Agent;

  async function insertSamples(
    kind: string,
    scores: number[],
    opts: { modality?: string; source?: string; version?: string; at?: string; attackType?: string } = {},
  ) {
    await ctx.pg.query(
      `INSERT INTO score_sample (modality, kind, score, model_version, source, attack_type, created_at)
       SELECT $1, $2, s, $3, $4, $5, COALESCE($6::timestamptz, now()) FROM unnest($7::float8[]) AS s`,
      [
        opts.modality ?? 'face',
        kind,
        opts.version ?? MODEL,
        opts.source ?? 'cross',
        opts.attackType ?? null,
        opts.at ?? null,
        scores,
      ],
    );
  }

  beforeAll(async () => {
    ctx = await createV2App(DB_URL!);
    admin = ctx.agent();
    await loginStaff(admin);
  });

  afterAll(async () => {
    await ctx.close();
  });

  it('субъект и аудитор: права на калибровку разграничены', async () => {
    const s = ctx.agent();
    await registerSubject(s, 'calib-subject', false);
    await s.get('/api/v1/calibration/overview').expect(403);
    await s.post('/api/v1/calibration/threshold').send({ modality: 'face', modelVersion: MODEL }).expect(403);
  });

  it('мало данных — понятный отказ', async () => {
    const r = await admin
      .post('/api/v1/calibration/threshold')
      .send({ modality: 'face', modelVersion: MODEL })
      .expect(422);
    expect(r.body.code).toBe('NOT_ENOUGH_DATA');
  });

  it('калибровка лица ядром v1: эксперимент, сравнение с текущим порогом, проверка достаточности', async () => {
    await insertSamples('genuine', normalSamples(400, 0.7, 0.08, 1), { source: 'login' });
    await insertSamples('impostor', normalSamples(4000, 0.2, 0.1, 2));
    const overview = await admin.get('/api/v1/calibration/overview').expect(200);
    expect(overview.body.data).toContainEqual(
      expect.objectContaining({ modality: 'face', modelVersion: MODEL, positives: 400, negatives: 4000 }),
    );
    expect(overview.body.activePolicy).toMatchObject({ version: 1, tauFace: 0.363, calibrated: false });

    const r = await admin
      .post('/api/v1/calibration/threshold')
      .send({ modality: 'face', modelVersion: MODEL, costs: { cFA: 100, cFR: 1 }, targetFar: 1e-3 })
      .expect(200);
    const t = r.body.threshold;
    expect(t.method).toBe('empirical-sweep');
    expect(t.sampleSizes).toEqual({ genuine: 400, impostor: 4000 });
    expect(t.optimal.tau).toBeGreaterThan(0.363);
    expect(t.optimal.tau).toBeLessThan(0.7);
    // Тот же порог на тех же данных: E при τ* не больше E при текущем пороге (оптимум по данным).
    expect(t.optimal.cost).toBeLessThanOrEqual((r.body.current.cost as number) + 1e-12);
    expect(r.body.sufficiency).toMatchObject({ positives: 400, negatives: 4000, targetFar: 1e-3 });
    expect(r.body.sufficiency.confirmedFar).toBeCloseTo(
      r.body.sufficiency.falseAccepts === 0 ? 3 / 4000 : r.body.sufficiency.confirmedFar,
      12,
    );
    expect(typeof r.body.sufficiency.enough).toBe('boolean');

    // Эксперимент неизменяем и ссылается на набор оценок v1.
    const exp = await admin.get(`/api/v1/experiments/${t.experimentId}`).expect(200);
    expect(exp.body.input.model).toEqual({ kind: 'empirical', datasetId: r.body.datasetId });

    // Повторная калибровка на тех же данных переиспользует набор (идемпотентно по содержимому).
    const again = await admin
      .post('/api/v1/calibration/threshold')
      .send({ modality: 'face', modelVersion: MODEL, costs: { cFA: 100, cFR: 1 } })
      .expect(200);
    expect(again.body.datasetId).toBe(r.body.datasetId);

    // Предложение политики из эксперимента и утверждение.
    const p = await admin
      .post('/api/v1/calibration/propose')
      .send({ faceExperimentId: t.experimentId })
      .expect(201);
    expect(p.body).toMatchObject({
      version: 2,
      status: 'proposed',
      experimentId: t.experimentId,
      costs: { cFA: 100, cFR: 1 },
    });
    expect(p.body.steps[0]).toMatchObject({
      factor: 'face',
      tauFace: t.optimal.tau,
      tauPad: 0.5,
      calibrated: true,
    });
    expect(p.body.rationale).toMatch(/τ_face/);
    await admin.post(`/api/v1/policies/${p.body.id}/approve`).send({}).expect(200);
    const after = await admin.get('/api/v1/calibration/overview').expect(200);
    expect(after.body.activePolicy).toMatchObject({ version: 2, calibrated: true, tauFace: t.optimal.tau });
  });

  it('испытание PAD: подлинные и атаки, APCER по видам атак и BPCER', async () => {
    const op = admin;
    const shot = (tag: string) => ({ frames: [frame('pad', tag), frame('pad', tag)] });
    for (let i = 0; i < 4; i++) {
      const r = await op
        .post('/api/v1/pad-test/samples')
        .send({ label: { kind: 'bonafide' }, ...shot('ok') })
        .expect(201);
      expect(r.body).toMatchObject({ pLive: 0.9, padVersion: 'fake-pad', detectedAsLive: true });
    }
    for (let i = 0; i < 3; i++) {
      await op
        .post('/api/v1/pad-test/samples')
        .send({ label: { kind: 'attack', attackType: 'print' }, ...shot('spoof') })
        .expect(201);
    }
    // Атака, которую модель не распознала (p_live высокий) — ошибка APCER для вида «экран».
    await op
      .post('/api/v1/pad-test/samples')
      .send({ label: { kind: 'attack', attackType: 'screen' }, ...shot('ok') })
      .expect(201);
    const rep = await op.get('/api/v1/pad-test/report').expect(200);
    expect(rep.body.padVersion).toBe('fake-pad');
    expect(rep.body.threshold).toBe(0.5);
    expect(rep.body.bpcer).toMatchObject({ errors: 0, total: 4, rate: 0 });
    expect(rep.body.apcer).toEqual([
      expect.objectContaining({ attackType: 'print', errors: 0, total: 3, rate: 0 }),
      expect.objectContaining({ attackType: 'screen', errors: 1, total: 1, rate: 1 }),
    ]);
    expect(rep.body.apcerMax).toBe(1);
    const strict = await op.get('/api/v1/pad-test/report?threshold=0.95').expect(200);
    expect(strict.body.bpcer.rate).toBe(1);
    await op
      .post('/api/v1/pad-test/samples')
      .send({ label: { kind: 'attack' }, ...shot('spoof') })
      .expect(400);

    // Калибровка τ_pad по записям испытания тем же ядром v1.
    await insertSamples('bonafide', normalSamples(20, 0.85, 0.05, 3), {
      modality: 'pad',
      source: 'pad_test',
      version: 'fake-pad',
    });
    await insertSamples('attack', normalSamples(20, 0.2, 0.08, 4), {
      modality: 'pad',
      source: 'pad_test',
      version: 'fake-pad',
      attackType: 'video',
    });
    const cal = await admin
      .post('/api/v1/calibration/threshold')
      .send({ modality: 'pad', modelVersion: 'fake-pad', costs: { cFA: 1, cFR: 1 } })
      .expect(200);
    expect(cal.body.threshold.optimal.tau).toBeGreaterThan(0.2);
    expect(cal.body.threshold.optimal.tau).toBeLessThan(0.9);
    const audit = await ctx.pg.query(
      "SELECT count(*)::int AS n FROM audit_event WHERE action = 'pad_test.recorded'",
    );
    expect(audit.rows[0].n).toBe(8);
  });

  it('протокол §10.11: «до/после калибровки» на одних данных с интервалами Уилсона', async () => {
    const r = await admin.get('/api/v1/calibration/report').expect(200);
    expect(r.body.modelVersion).toBe(MODEL);
    expect(r.body.costs).toEqual({ cFA: 100, cFR: 1 });
    expect(r.body.rows.map((x: { policyVersion: number }) => x.policyVersion)).toEqual([1, 2]);
    const [before, after] = r.body.rows as {
      tauFace: number;
      cost: number;
      far: { rate: number; interval: [number, number]; total: number };
      frr: { rate: number; interval: [number, number] };
      bpcer: { total: number };
    }[];
    expect(before!.tauFace).toBe(0.363);
    expect(after!.tauFace).toBeGreaterThan(0.363);
    // Калибровка по этим же данным не может ухудшить ожидаемые потери при том же профиле стоимостей.
    expect(after!.cost).toBeLessThanOrEqual(before!.cost + 1e-12);
    for (const row of [before!, after!]) {
      expect(row.far.total).toBe(r.body.sampleSizes.impostor);
      expect(row.far.interval[0]).toBeLessThanOrEqual(row.far.rate);
      expect(row.far.interval[1]).toBeGreaterThanOrEqual(row.far.rate);
      expect(row.frr.interval[0]).toBeLessThanOrEqual(row.frr.rate);
      expect(row.bpcer.total).toBeGreaterThan(0);
    }
    const custom = await admin.get('/api/v1/calibration/report?versions=2&cFA=1&cFR=1').expect(200);
    expect(custom.body.rows).toHaveLength(1);
    expect(custom.body.costs).toEqual({ cFA: 1, cFR: 1 });
    await admin.get('/api/v1/calibration/report?versions=99').expect(404);
    await admin.get('/api/v1/calibration/report?cFA=1').expect(400);
  });

  it('измеренный каталог факторов решается решателем состава факторов v1', async () => {
    // Попытки: субъект входит лицом; passkey — одна успешная и одна отменённая церемония.
    const s = ctx.agent();
    await registerSubject(s, 'measured-user');
    const pol = (await admin.get('/api/v1/calibration/overview').expect(200)).body.activePolicy;
    const ins = (factor: string, outcome: string, ms: number) =>
      ctx.pg.query(
        'INSERT INTO auth_attempt (policy_id, factor, outcome, duration_ms) VALUES ($1, $2, $3, $4)',
        [pol.id, factor, outcome, ms],
      );
    await ins('face', 'accept', 1800);
    await ins('face', 'reject', 2200);
    await ins('passkey', 'accept', 900);
    await ins('passkey', 'cancel', 3000);

    const m = await admin.get('/api/v1/calibration/factors').expect(200);
    const face = m.body.factors.find((f: { code: string }) => f.code === 'FACE');
    const pk = m.body.factors.find((f: { code: string }) => f.code === 'PASSKEY');
    expect(face).toMatchObject({ hasPad: true, provenance: 'measured', sources: { far: 'measured' } });
    expect(face.far).toBeGreaterThan(0);
    expect(face.far).toBeLessThan(1);
    expect(face.frrInterval[0]).toBeLessThanOrEqual(face.frr);
    expect(pk).toMatchObject({ far: 2e-5, frr: 0.5, provenance: 'declared', attempts: 2, latencyMs: 1950 });

    const cat = await admin
      .post('/api/v1/calibration/factors/catalog')
      .send({ name: 'Измерено e2e', costs: { FACE: 0.8 } })
      .expect(201);
    expect(cat.body.factors.map((f: { code: string; provenance: string }) => [f.code, f.provenance])).toEqual(
      [
        ['FACE', 'measured'],
        ['PASSKEY', 'declared'],
      ],
    );
    expect(cat.body.factors[0].cost).toBe(0.8);
    const solve = await ctx
      .agent()
      .post('/api/v1/factor-selection/solve')
      .send({
        catalogId: cat.body.id,
        costs: { cFA: 100, cFR: 1 },
        constraints: { latencyMaxMs: null, budget: null, farMax: null, minPadFactors: 1 },
      })
      .expect(200);
    expect(solve.body.status).toBe('optimal');
    expect(solve.body.optimum.codes).toContain('FACE');
  });

  it('журнал попыток: фильтры, агрегаты; аудитор не видит оценок и логинов', async () => {
    const page = await admin.get('/api/v1/attempts?factor=passkey&limit=1').expect(200);
    expect(page.body.items).toHaveLength(1);
    expect(page.body.nextCursor).toBeTruthy();
    const next = await admin
      .get(`/api/v1/attempts?factor=passkey&limit=1&cursor=${page.body.nextCursor}`)
      .expect(200);
    expect(next.body.items[0].id).not.toBe(page.body.items[0].id);
    const stats = page.body.stats.find((x: { factor: string }) => x.factor === 'passkey');
    expect(stats).toMatchObject({ total: 2, accepted: 1, cancelled: 1, p50Ms: 1950 });

    await ctx.pg.query(
      "INSERT INTO app_user (login, display_name, role, password_hash) SELECT 'auditor1', 'Аудитор', 'auditor', password_hash FROM app_user WHERE login = 'admin'",
    );
    const aud = ctx.agent();
    await loginStaff(aud, 'auditor1');
    const seen = await aud.get('/api/v1/attempts?limit=50').expect(200);
    expect(
      seen.body.items.every((i: { score: unknown; login: unknown }) => i.score === null && i.login === null),
    ).toBe(true);
    await aud
      .post('/api/v1/calibration/threshold')
      .send({ modality: 'face', modelVersion: MODEL })
      .expect(403);
    await aud.get('/api/v1/audit/verify').expect(200);
  });

  it('дрейф FRR: рост отказов за неделю → уведомление (идемпотентно), подтверждение администратором', async () => {
    const none = await admin.post('/api/v1/calibration/drift/check').expect(200);
    expect(['ok', 'alert', 'skipped']).toContain(none.body.status);
    await ctx.pg.query('DELETE FROM drift_alert');
    const tau = (await admin.get('/api/v1/calibration/overview').expect(200)).body.activePolicy
      .tauFace as number;
    // Свежие genuine-оценки заметно ниже порога: FRR растёт.
    await insertSamples(
      'genuine',
      [...normalSamples(60, tau - 0.1, 0.03, 9), ...normalSamples(60, 0.75, 0.03, 10)],
      { source: 'login' },
    );
    const r = await admin.post('/api/v1/calibration/drift/check').expect(200);
    expect(r.body).toMatchObject({ status: 'alert', created: true });
    expect(r.body.recentFrr).toBeGreaterThan(r.body.baselineFrr);
    expect(r.body.zScore).toBeGreaterThan(2);
    const again = await admin.post('/api/v1/calibration/drift/check').expect(200);
    expect(again.body).toMatchObject({ status: 'alert', created: false });
    const ov = await admin.get('/api/v1/calibration/overview').expect(200);
    expect(ov.body.drift).toHaveLength(1);
    await admin.post(`/api/v1/calibration/drift/${ov.body.drift[0].id}/acknowledge`).expect(204);
    expect((await admin.get('/api/v1/calibration/overview').expect(200)).body.drift).toHaveLength(0);
  });
  it('пакетный режим: архив → набор оценок v1 и калибровка; отказ, отмена, одна задача за раз', async () => {
    const zip = (marker: string) => Buffer.concat([Buffer.from('PK\u0003\u0004'), Buffer.from(marker)]);
    const wait = async (id: string): Promise<BatchJobDto> => {
      for (let i = 0; i < 100; i++) {
        const r = await admin.get(`/api/v1/calibration/batch/${id}`).expect(200);
        const job = batchJobSchema.parse(r.body);
        if (job.state !== 'running') return job;
        await new Promise((res) => setTimeout(res, 50));
      }
      throw new Error('задача не завершилась');
    };

    const s = ctx.agent();
    await registerSubject(s, 'batch-subject', false);
    await s.post('/api/v1/calibration/batch').attach('file', zip('ok'), 'set.zip').expect(403);
    await admin.post('/api/v1/calibration/batch').field('seed', '1').expect(400);

    const started = await admin
      .post('/api/v1/calibration/batch')
      .attach('file', zip('ok'), 'lfw-subset.zip')
      .field('seed', '7')
      .field('maxImpostor', '4')
      .field('includeInCalibration', 'true')
      .expect(202);
    expect(started.body).toMatchObject({
      state: 'running',
      name: 'lfw-subset',
      seed: 7,
      includeInCalibration: true,
    });
    const done = await wait(started.body.id);
    expect(done).toMatchObject({
      state: 'done',
      error: null,
      result: {
        genuineCount: 3,
        impostorCount: 4,
        skippedTotal: 1,
        impostorSampled: true,
        impostorTotal: 12,
      },
    });

    // Набор оценок v1: CSV score,label → расчёт порога в эмпирическом режиме (критерий этапа 6).
    const ds = await admin.get(`/api/v1/score-datasets/${done.result!.datasetId}`).expect(200);
    expect(ds.body).toMatchObject({ genuineCount: 3, impostorCount: 4 });
    const t = await admin
      .post('/api/v1/threshold/optimize')
      .send({ model: { kind: 'empirical', datasetId: done.result!.datasetId }, costs: { cFA: 1, cFR: 1 } })
      .expect(200);
    expect(t.body.optimal.frr).toBe(0);
    const csv = await admin.get(`/api/v1/calibration/batch/${started.body.id}/csv`).expect(200);
    expect(csv.headers['content-type']).toContain('text/csv');
    expect(csv.text.split('\n')[0]).toBe('score,label');
    expect(csv.text).toContain('0.057,impostor');

    const overview = await admin.get('/api/v1/calibration/overview').expect(200);
    const face = overview.body.data.find(
      (d: { modality: string; modelVersion: string }) => d.modality === 'face' && d.modelVersion === MODEL,
    );
    expect(face.bySource['batch:genuine']).toBe(3);
    expect(face.bySource['batch:impostor']).toBe(4);
    const audit = await admin.get('/api/v1/audit/events?limit=5').expect(200);
    expect(audit.body.map((e: { action: string }) => e.action)).toContain('batch.scored');

    const empty = await admin
      .post('/api/v1/calibration/batch')
      .attach('file', zip('EMPTY'), 'e.zip')
      .expect(202);
    expect(await wait(empty.body.id)).toMatchObject({ state: 'failed', error: 'в архиве нет изображений' });

    const slow = await admin
      .post('/api/v1/calibration/batch')
      .attach('file', zip('SLOW'), 's.zip')
      .expect(202);
    await admin.post('/api/v1/calibration/batch').attach('file', zip('ok'), 'x.zip').expect(409);
    await admin.delete(`/api/v1/calibration/batch/${slow.body.id}`).expect(204);
    expect((await admin.get(`/api/v1/calibration/batch/${slow.body.id}`).expect(200)).body.state).toBe(
      'cancelled',
    );
    await admin.delete(`/api/v1/calibration/batch/${slow.body.id}`).expect(409);
    const list = await admin.get('/api/v1/calibration/batch').expect(200);
    expect(list.body[0].id).toBe(slow.body.id);
  });
});
