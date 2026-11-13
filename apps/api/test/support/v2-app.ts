import { join } from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import request from 'supertest';

import { type FakeBioEngine, frame, SECRET, startFakeBioEngine } from './fake-bio-engine';
import { FakeWebAuthn } from './fake-webauthn';

export type Agent = ReturnType<typeof request.agent>;

export interface V2App {
  app: INestApplication;
  server: Parameters<typeof request>[0];
  pg: Client;
  bio: FakeBioEngine;
  drain: () => Promise<void>;
  agent: () => Agent;
  close: () => Promise<void>;
}

/** Приложение v2 на чистой схеме PostgreSQL с поддельными bio-engine и WebAuthn (контракты те же). */
export async function createV2App(dbUrl: string, env: Record<string, string> = {}): Promise<V2App> {
  const pg = new Client({ connectionString: dbUrl });
  await pg.connect();
  await pg.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  const bio = await startFakeBioEngine();
  Object.assign(process.env, {
    DATABASE_URL: dbUrl,
    LOG_LEVEL: 'silent',
    NODE_ENV: 'test',
    BIO_ENGINE_URL: bio.url,
    BIO_ENGINE_SECRET: SECRET,
    ADMIN_LOGIN: 'admin',
    ADMIN_PASSWORD: 'admin-password-123',
    REQUIRE_STAFF_PASSKEY: 'false',
    CROSS_IMPOSTOR_LIMIT: '50',
    ...env,
  });
  const { migrate } = await import('../../src/shared/database/migrator');
  await migrate(dbUrl, join(__dirname, '..', '..', 'migrations'));
  const { AppModule, configureApp } = await import('../../src/bootstrap');
  const { WEBAUTHN } = await import('../../src/modules/webauthn/application/ports');
  const { BackgroundTasks } = await import('../../src/modules/biometrics/infrastructure/background-tasks');
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(WEBAUTHN)
    .useValue(new FakeWebAuthn())
    .compile();
  const app = configureApp(moduleRef.createNestApplication({ bufferLogs: true }));
  await app.init();
  const server = app.getHttpServer() as Parameters<typeof request>[0];
  const tasks = app.get(BackgroundTasks);
  return {
    app,
    server,
    pg,
    bio,
    drain: () => tasks.drain(),
    agent: () => request.agent(server),
    close: async () => {
      await app.close();
      await bio.close();
      await pg.end();
    },
  };
}

export async function registerSubject(a: Agent, login: string, enroll = true): Promise<void> {
  await a.post('/api/v1/identity/subjects').send({ login, displayName: login }).expect(201);
  await a.post('/api/v1/consent').send({ textVersion: 'v2', accepted: true }).expect(204);
  if (enroll) {
    await a
      .post('/api/v1/enrollment/face')
      .send({ frames: [frame(login), frame(login), frame(login)] })
      .expect(201);
  }
}

export async function loginStaff(a: Agent, login = 'admin', password = 'admin-password-123'): Promise<void> {
  await a.post('/api/v1/identity/login').send({ login, password }).expect(200);
}

/** Детерминированный нормальный генератор (Бокс — Мюллер с LCG) для синтетических оценок. */
export function normalSamples(n: number, mean: number, std: number, seed: number): number[] {
  let s = seed >>> 0;
  const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
  return Array.from({ length: n }, () => {
    const z = Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
    return Math.max(-1, Math.min(1, mean + std * z));
  });
}
