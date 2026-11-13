import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';

import {
  attemptFrames,
  type FakeBioEngine,
  frame,
  SECRET,
  startFakeBioEngine,
} from '../support/fake-bio-engine';
import { FakeWebAuthn } from '../support/fake-webauthn';

const DB_URL = process.env.TEST_DATABASE_URL;
if (process.env.CI && !DB_URL) throw new Error('TEST_DATABASE_URL не задана в CI');
const describeDb = DB_URL ? describe : describe.skip;

type Agent = ReturnType<typeof request.agent>;

/**
 * E2E v2 на реальном PostgreSQL: регистрация, согласие, шаблоны, вход по политике, блокировка, passkey,
 * политики с утверждением, отзыв согласия и журнал аудита. bio-engine и WebAuthn — поддельные адаптеры
 * с тем же контрактом (настоящие проверяются в services/bio-engine и браузерном e2e).
 */
describeDb('API v2 e2e: биометрия и вход (PostgreSQL)', () => {
  let app: INestApplication | undefined;
  let bio: FakeBioEngine;
  let pg: Client;
  let server: Parameters<typeof request>[0];
  let drain: () => Promise<void>;

  const agent = (): Agent => request.agent(server);

  async function registerSubject(
    login: string,
    opts: { consent?: boolean; enroll?: boolean } = {},
  ): Promise<Agent> {
    const a = agent();
    await a.post('/api/v1/identity/subjects').send({ login, displayName: login }).expect(201);
    if (opts.consent ?? true) {
      await a.post('/api/v1/consent').send({ textVersion: 'v2', accepted: true }).expect(204);
    }
    if (opts.enroll ?? true) {
      await a
        .post('/api/v1/enrollment/face')
        .send({ frames: [frame(login), frame(login), frame(login), frame(login)] })
        .expect(201);
    }
    return a;
  }

  async function startLogin(a: Agent, login: string) {
    const r = await a.post('/api/v1/auth/sessions').send({ login }).expect(201);
    return r.body as {
      sessionId: string;
      steps: { factor: string; commands?: string[] }[];
      attemptsLeft: number;
    };
  }

  beforeAll(async () => {
    pg = new Client({ connectionString: DB_URL });
    await pg.connect();
    await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    bio = await startFakeBioEngine();
    Object.assign(process.env, {
      DATABASE_URL: DB_URL,
      LOG_LEVEL: 'silent',
      NODE_ENV: 'test',
      BIO_ENGINE_URL: bio.url,
      BIO_ENGINE_SECRET: SECRET,
      ADMIN_LOGIN: 'admin',
      ADMIN_PASSWORD: 'admin-password-123',
      REQUIRE_STAFF_PASSKEY: 'true',
      CROSS_IMPOSTOR_LIMIT: '50',
    });
    const { migrate } = await import('../../src/shared/database/migrator');
    await migrate(DB_URL!, join(__dirname, '..', '..', 'migrations'));
    const { AppModule, configureApp } = await import('../../src/bootstrap');
    const { WEBAUTHN } = await import('../../src/modules/webauthn/application/ports');
    const { BackgroundTasks } = await import('../../src/modules/biometrics/infrastructure/background-tasks');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(WEBAUTHN)
      .useValue(new FakeWebAuthn())
      .compile();
    const created = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
    await created.init();
    app = created;
    server = created.getHttpServer() as Parameters<typeof request>[0];
    const tasks = created.get(BackgroundTasks);
    drain = () => tasks.drain();
  });

  afterAll(async () => {
    if (app) await app.close();
    await bio.close();
    await pg.end();
  });

  it('эндпоинты v2 закрыты по умолчанию, v1 открыт явно', async () => {
    await request(server).get('/api/v1/identity/me').expect(401);
    await request(server).post('/api/v1/enrollment/face').send({}).expect(401);
    await request(server).get('/api/v1/policies').expect(401);
    await request(server).get('/api/v1/examples/sro1').expect(200);
    await request(server).get('/api/v1/consent/text').expect(200);
  });

  it('регистрация субъекта: сессия в httpOnly cookie, логин уникален', async () => {
    const a = agent();
    const r = await a
      .post('/api/v1/identity/subjects')
      .send({ login: 'Ivan.Petrov', displayName: 'Иван' })
      .expect(201);
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/bioauth_session=.+HttpOnly.+SameSite=Lax/i);
    const me = await a.get('/api/v1/identity/me').expect(200);
    expect(me.body).toMatchObject({
      login: 'ivan.petrov',
      role: 'subject',
      consent: null,
      face: null,
      passkeys: 0,
    });
    await agent()
      .post('/api/v1/identity/subjects')
      .send({ login: 'ivan.petrov', displayName: 'Другой' })
      .expect(409);
  });

  it('запрос с cookie и чужим Origin отклоняется (CSRF)', async () => {
    const a = await registerSubject('csrf-user', { consent: false, enroll: false });
    await a
      .post('/api/v1/consent')
      .set('Origin', 'https://evil.example')
      .send({ textVersion: 'v2', accepted: true })
      .expect(403);
  });

  it('без согласия кадры не обрабатываются', async () => {
    const a = await registerSubject('no-consent', { consent: false, enroll: false });
    const calls = bio.calls.length;
    const r = await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame('x'), frame('x'), frame('x')] })
      .expect(403);
    expect(r.body.detail).toMatch(/согласие/);
    expect(bio.calls.length).toBe(calls);
  });

  it('регистрация лица: шаблон зашифрован, genuine-оценки пар записаны, плохие кадры объясняются', async () => {
    const a = await registerSubject('alice', { enroll: false });
    const bad = await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame('alice'), frame('alice', 'bad'), frame('alice', 'bad')] })
      .expect(422);
    expect(bad.body.code).toBe('FACE_QUALITY');
    expect(bad.body.frames.map((f: { issues: string[] }) => f.issues)).toEqual([
      [],
      ['NO_FACE'],
      ['NO_FACE'],
    ]);

    const ok = await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame('alice'), frame('alice'), frame('alice'), frame('alice')] })
      .expect(201);
    expect(ok.body).toEqual({
      enrolled: true,
      framesUsed: 4,
      modelVersion: 'fake-sface+fake-yunet',
      livenessPassed: true,
    });

    const row = await pg.query<{ ciphertext: Buffer; key_id: string; cancelable: boolean }>(
      "SELECT t.ciphertext, t.key_id, t.cancelable FROM face_template t JOIN app_user u ON u.id = t.user_id WHERE u.login = 'alice'",
    );
    expect(row.rows[0]!.ciphertext.length).toBe(128 * 8 + 16);
    expect(row.rows[0]!.cancelable).toBe(true);
    // В открытом виде эмбеддинг — единичный вектор; в шифротексте не должно быть его байтов (8 байт 1.0).
    expect(row.rows[0]!.ciphertext.includes(Buffer.from(new Float64Array([1]).buffer))).toBe(false);
    const genuine = await pg.query(
      "SELECT count(*)::int AS n FROM score_sample WHERE source = 'enroll' AND kind = 'genuine'",
    );
    expect(genuine.rows[0].n).toBe(6);
  });

  it('пассивная PAD при регистрации: фото или экран отклоняются', async () => {
    const a = await registerSubject('spoofer', { enroll: false });
    const r = await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame('s', 'spoof'), frame('s', 'spoof'), frame('s', 'spoof')] })
      .expect(422);
    expect(r.body.code).toBe('LIVENESS_PASSIVE');
  });

  it('вход по лицу с 3 случайными командами: сессия выдана, попытка и impostor-оценки записаны', async () => {
    await registerSubject('bob');
    const a = agent();
    const s = await startLogin(a, 'alice');
    const face = s.steps[0]!;
    expect(face.factor).toBe('face');
    expect(face.commands).toHaveLength(3);
    expect(new Set(face.commands).size).toBe(3);

    // Живые подсказки позы: геометрия кадра без решения; кадр без лица — понятный ответ.
    const pose = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/pose`)
      .send({ image: frame('alice').image, width: 320, height: 240 })
      .expect(200);
    expect(pose.body).toMatchObject({ face: true, issues: [], yawRatio: 0, interocularPx: 80 });
    expect(pose.body.box[0]).toBeCloseTo(0.25, 6);
    const noFace = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/pose`)
      .send({ image: frame('alice', 'bad').image, width: 320, height: 240 })
      .expect(200);
    expect(noFace.body).toMatchObject({ face: false, box: null });

    const r = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('alice', face.commands!))
      .expect(200);
    expect(r.body).toMatchObject({ outcome: 'accepted', reason: null });
    await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/pose`)
      .send({ image: frame('alice').image, width: 320, height: 240 })
      .expect(409);
    expect(JSON.stringify(r.body)).not.toMatch(/score|tau|0\.8/i); // пороги и оценки клиенту не отдаются
    const me = await a.get('/api/v1/identity/me').expect(200);
    expect(me.body.login).toBe('alice');

    await drain();
    const attempts = await pg.query(
      'SELECT outcome, challenges_ok, model_version FROM auth_attempt WHERE session_id = $1',
      [s.sessionId],
    );
    expect(attempts.rows).toEqual([
      { outcome: 'accept', challenges_ok: true, model_version: 'fake-sface+fake-yunet' },
    ]);
    const cross = await pg.query<{ n: number; max: number }>(
      "SELECT count(*)::int AS n, max(score) AS max FROM score_sample WHERE source = 'cross' AND kind = 'impostor'",
    );
    expect(cross.rows[0]!.n).toBeGreaterThanOrEqual(1);
    expect(cross.rows[0]!.max).toBeLessThan(0.5);

    // Повторная отправка в завершённую сессию невозможна.
    await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('alice', face.commands!))
      .expect(409);
  });

  it('команды не совпадают с выданными — 400; невыполненная команда — повтор с новыми командами', async () => {
    const a = agent();
    const s = await startLogin(a, 'bob');
    const cmds = s.steps[0]!.commands!;
    await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', [...cmds].reverse()))
      .expect(400);
    const r = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', cmds, { skip: cmds[1] }))
      .expect(200);
    expect(r.body).toMatchObject({ outcome: 'retry', reason: 'LIVENESS_COMMANDS', attemptsLeft: 2 });
    expect(r.body.commands).toHaveLength(3);
    const ok = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', r.body.commands))
      .expect(200);
    expect(ok.body.outcome).toBe('accepted');
  });

  it('подмена лица и чужое лицо отклоняются; 3 неудачи — блокировка логина', async () => {
    await registerSubject('carol');
    const a = agent();
    const s = await startLogin(a, 'carol');
    let cmds = s.steps[0]!.commands!;
    const swap = attemptFrames('carol', cmds);
    swap.steps[1]!.frames = [frame('bob', cmds[1], 5000)];
    const r1 = await a.post(`/api/v1/auth/sessions/${s.sessionId}/face`).send(swap).expect(200);
    expect(r1.body.reason).toBe('IDENTITY_SWITCH');
    cmds = r1.body.commands;
    const r2 = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', cmds))
      .expect(200);
    expect(r2.body.reason).toBe('NO_MATCH');
    const r3 = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', r2.body.commands))
      .expect(200);
    expect(r3.body).toMatchObject({ outcome: 'locked', reason: 'LOCKED', attemptsLeft: 0 });
    expect(Date.parse(r3.body.lockedUntil)).toBeGreaterThan(Date.now());

    const locked = await agent().post('/api/v1/auth/sessions').send({ login: 'carol' }).expect(429);
    expect(locked.body.lockedUntil).toBeTruthy();
    const audit = await pg.query("SELECT count(*)::int AS n FROM audit_event WHERE action = 'user.locked'");
    expect(audit.rows[0].n).toBe(1);
  });

  it('неизвестный логин получает сессию того же вида, но вход невозможен', async () => {
    const a = agent();
    const s = await startLogin(a, 'nobody');
    expect(s.steps[0]!.commands).toHaveLength(3);
    const r = await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('nobody', s.steps[0]!.commands!))
      .expect(200);
    expect(r.body).toMatchObject({ outcome: 'retry', reason: 'NO_MATCH' });
  });

  describe('сотрудник, политики и passkey', () => {
    const admin = (): Agent => agent();
    let staff: Agent;

    it('вход администратора: пароль, затем обязательный passkey; без него политики не утверждаются', async () => {
      staff = admin();
      await staff
        .post('/api/v1/identity/login')
        .send({ login: 'admin', password: 'wrong-password' })
        .expect(401);
      const r = await staff
        .post('/api/v1/identity/login')
        .send({ login: 'admin', password: 'admin-password-123' })
        .expect(200);
      expect(r.body).toEqual({ mfaRequired: true });
      const list = await staff.get('/api/v1/policies').expect(200);
      expect(list.body).toHaveLength(1);
      expect(list.body[0]).toMatchObject({ version: 1, status: 'active' });
      await staff
        .post('/api/v1/policies')
        .send({
          steps: [{ factor: 'face', tauFace: 0.4, tauPad: 0.6, commands: 3, calibrated: false }],
          costs: { cFA: 10, cFR: 1 },
        })
        .expect(403);

      const opts = await staff.post('/api/v1/webauthn/register/options').expect(200);
      await staff
        .post('/api/v1/webauthn/register/verify')
        .send({ id: 'admin-key', type: 'public-key', challenge: opts.body.challenge })
        .expect(201);
      const me = await staff.get('/api/v1/identity/me').expect(200);
      expect(me.body).toMatchObject({ role: 'admin', mfaComplete: true, passkeys: 1 });
    });

    it('субъект не имеет доступа к политикам', async () => {
      const a = await registerSubject('dave', { enroll: false });
      await a.get('/api/v1/policies').expect(403);
    });

    it('политика «лицо + passkey»: предложение, утверждение, вход по новой версии с genuine-оценкой', async () => {
      const proposed = await staff
        .post('/api/v1/policies')
        .send({
          steps: [
            { factor: 'face', tauFace: 0.5, tauPad: 0.6, commands: 3, calibrated: true },
            { factor: 'passkey' },
          ],
          costs: { cFA: 200, cFR: 1 },
          rationale: 'e2e',
        })
        .expect(201);
      expect(proposed.body).toMatchObject({ version: 2, status: 'proposed', proposedBy: 'admin' });
      const approved = await staff
        .post(`/api/v1/policies/${proposed.body.id}/approve`)
        .send({ note: 'ok' })
        .expect(200);
      expect(approved.body).toMatchObject({ status: 'active', decidedBy: 'admin' });
      await staff.post(`/api/v1/policies/${proposed.body.id}/approve`).send({}).expect(409);
      const versions = await staff.get('/api/v1/policies').expect(200);
      expect(versions.body.map((p: { version: number; status: string }) => [p.version, p.status])).toEqual([
        [2, 'active'],
        [1, 'retired'],
      ]);

      // Субъект регистрирует passkey и входит по двум шагам.
      const alice = agent();
      const s0 = await startLogin(alice, 'alice');
      const r0 = await alice
        .post(`/api/v1/auth/sessions/${s0.sessionId}/face`)
        .send(attemptFrames('alice', s0.steps[0]!.commands!));
      expect(r0.body.outcome).toBe('continue');
      const o0 = await alice.post(`/api/v1/auth/sessions/${s0.sessionId}/passkey/options`).expect(200);
      // passkey ещё не зарегистрирован — подтверждение невозможно
      const f0 = await alice
        .post(`/api/v1/auth/sessions/${s0.sessionId}/passkey/verify`)
        .send({ id: 'alice-key', type: 'public-key', challenge: o0.body.challenge })
        .expect(200);
      expect(f0.body).toMatchObject({ outcome: 'retry', reason: 'PASSKEY_FAILED' });

      const logged = await registerSubject('erin', { enroll: true });
      const ro = await logged.post('/api/v1/webauthn/register/options').expect(200);
      await logged
        .post('/api/v1/webauthn/register/verify')
        .send({ id: 'erin-key', type: 'public-key', challenge: ro.body.challenge })
        .expect(201);

      const b = agent();
      const s = await startLogin(b, 'erin');
      expect(s.steps.map((x) => x.factor)).toEqual(['face', 'passkey']);
      const rf = await b
        .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
        .send(attemptFrames('erin', s.steps[0]!.commands!))
        .expect(200);
      expect(rf.body).toMatchObject({ outcome: 'continue', currentStep: 1 });
      await b.get('/api/v1/identity/me').expect(401); // вход ещё не завершён
      const o = await b.post(`/api/v1/auth/sessions/${s.sessionId}/passkey/options`).expect(200);
      const rp = await b
        .post(`/api/v1/auth/sessions/${s.sessionId}/passkey/verify`)
        .send({ id: 'erin-key', type: 'public-key', challenge: o.body.challenge })
        .expect(200);
      expect(rp.body.outcome).toBe('accepted');
      expect((await b.get('/api/v1/identity/me').expect(200)).body.login).toBe('erin');
      const genuine = await pg.query(
        "SELECT count(*)::int AS n FROM score_sample WHERE source = 'login' AND kind = 'genuine'",
      );
      expect(genuine.rows[0].n).toBe(1);
      const attempts = await pg.query(
        'SELECT a.factor, p.version FROM auth_attempt a JOIN auth_policy p ON p.id = a.policy_id WHERE a.session_id = $1 ORDER BY a.created_at',
        [s.sessionId],
      );
      expect(attempts.rows).toEqual([
        { factor: 'face', version: 2 },
        { factor: 'passkey', version: 2 },
      ]);

      // Откат к версии 1
      const v1 = versions.body.find((p: { version: number }) => p.version === 1);
      await staff.post(`/api/v1/policies/${v1.id}/rollback`).send({ note: 'откат' }).expect(200);
      const one = await pg.query("SELECT count(*)::int AS n FROM auth_policy WHERE status = 'active'");
      expect(one.rows[0].n).toBe(1);
    });

    it('две активные политики запрещены схемой БД', async () => {
      await expect(pg.query("UPDATE auth_policy SET status = 'active'")).rejects.toThrow(
        /auth_policy_single_active_idx/,
      );
    });
  });

  it('отзыв согласия: шаблон и passkey удалены, оценки и попытки обезличены', async () => {
    const a = agent();
    const s = await startLogin(a, 'bob');
    await a
      .post(`/api/v1/auth/sessions/${s.sessionId}/face`)
      .send(attemptFrames('bob', s.steps[0]!.commands!))
      .expect(200);
    const uid = (await pg.query<{ id: string }>("SELECT id FROM app_user WHERE login = 'bob'")).rows[0]!.id;
    const r = await a.delete('/api/v1/consent').expect(200);
    expect(r.body).toMatchObject({ revoked: true, face: true });
    expect(r.body.samplesAnonymized).toBeGreaterThan(0);
    const left = await pg.query(
      'SELECT (SELECT count(*) FROM face_template WHERE user_id = $1)::int AS t, (SELECT count(*) FROM score_sample WHERE user_id = $1)::int AS s, (SELECT count(*) FROM auth_attempt WHERE user_id = $1)::int AS a',
      [uid],
    );
    expect(left.rows[0]).toEqual({ t: 0, s: 0, a: 0 });
    await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame('bob'), frame('bob'), frame('bob')] })
      .expect(403);
  });

  it('журнал аудита: цепочка цела, изменение запрещено, подделка обнаруживается', async () => {
    const auditor = agent();
    await auditor
      .post('/api/v1/identity/login')
      .send({ login: 'admin', password: 'admin-password-123' })
      .expect(200);
    const events = await auditor.get('/api/v1/audit/events?limit=500').expect(200);
    const actions = new Set(events.body.map((e: { action: string }) => e.action));
    for (const a of [
      'consent.granted',
      'consent.revoked',
      'face.enrolled',
      'face.deleted',
      'policy.approved',
      'passkey.registered',
    ]) {
      expect(actions).toContain(a);
    }
    expect(JSON.stringify(events.body)).not.toMatch(/embedding|FAKE\|/); // биометрия в журнал не попадает
    expect((await auditor.get('/api/v1/audit/verify').expect(200)).body).toMatchObject({
      ok: true,
      brokenAt: null,
    });

    const json = await auditor.get('/api/v1/audit/export?format=json&action=consent.granted').expect(200);
    expect(json.headers['x-audit-chain-ok']).toBe('true');
    expect(json.headers['content-disposition']).toMatch(/audit-\d{4}-\d{2}-\d{2}\.json/);
    expect(json.body.length).toBeGreaterThan(0);
    expect(json.body.every((e: { action: string }) => e.action === 'consent.granted')).toBe(true);
    const seqs = json.body.map((e: { seq: number }) => e.seq);
    expect(seqs).toEqual([...seqs].sort((a: number, b: number) => a - b));
    const csv = await auditor.get('/api/v1/audit/export?format=csv').expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('﻿seq,at,actorId,action,target,details,hash\n')).toBe(true);
    const none = await auditor.get('/api/v1/audit/export?to=2000-01-01T00:00:00Z').expect(200);
    expect(none.body).toEqual([]);
    await auditor.get('/api/v1/audit/export?format=xml').expect(400);
    await auditor.get('/api/v1/audit/export?from=вчера').expect(400);

    await expect(pg.query("UPDATE audit_event SET action = 'x.y.z'")).rejects.toThrow(/только дополняется/);
    await expect(pg.query('DELETE FROM audit_event')).rejects.toThrow(/только дополняется/);
    await pg.query(
      "INSERT INTO audit_event (at, action, prev_hash, hash) SELECT now(), 'forged.event', hash, repeat('a', 64) FROM audit_event ORDER BY seq DESC LIMIT 1",
    );
    const v = await auditor.get('/api/v1/audit/verify').expect(200);
    expect(v.body.ok).toBe(false);
    expect(v.body.brokenAt).toBeGreaterThan(0);
  });
});
