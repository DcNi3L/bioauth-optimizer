import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { CalibrateResponseDto } from '@bioauth/contracts';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import type { AuthUser } from '../../shared/auth/auth';
import { USER_REPOSITORY, type UserRepository } from '../identity/application/ports';
import { KEYSTROKE_MODEL } from '../keystroke/domain/keystroke';
import { PolicyService } from '../policy/application/policy.use-cases';
import { BatchJobsService } from './application/batch-jobs.service';
import { CalibrationService } from './application/calibration.service';
import { KeystrokeBatchService } from './application/keystroke-batch.service';
import { CALIBRATION_QUERY, type CalibrationQuery } from './application/ports';
import { farTargetThreshold } from './application/stats';
import {
  CMU_KEYSTROKE,
  loadCmuKeystroke,
  loadOrl,
  ORL,
  parseCmuKeystroke,
  pgmToPng,
  storedZip,
} from './infrastructure/open-datasets';

/**
 * Полная калибровка замкнутого контура (docs/10 §10.16, ADR-0027):
 *
 *   pnpm --filter @bioauth/api calibrate -- --as admin --approve
 *   make calibrate                      # то же внутри контейнера api
 *
 * 1. Лицо: открытый набор AT&T (ORL), 40 × 9 снимков → пакетный режим bio-engine → оценки калибровки.
 * 2. Ритм набора: CMU Keystroke Benchmark, 51 человек → тот же детектор, что при входе → оценки калибровки.
 * 3. PAD: только по записанным испытаниям (UC-8) — подлинное предъявление требует живой камеры.
 * 4. Ядро v1 считает τ* по каждой модальности; новая версия политики предлагается и (--approve) утверждается.
 *
 * Работает внутри процесса API без HTTP: действия записываются в аудит от имени указанного администратора.
 */

/** Порог, отвергающий больше половины законных вводов, в политику не попадает. */
const MAX_FRR = 0.5;
const log = (msg: string) => process.stdout.write(`${msg}\n`);
const fmt = (x: number | null | undefined, digits = 4) =>
  x === null || x === undefined ? '—' : x.toLocaleString('ru-RU', { maximumSignificantDigits: digits });
const pct = (x: number | null | undefined) => (x === null || x === undefined ? '—' : `${fmt(x * 100, 3)} %`);

function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // файла нет — используем окружение процесса
  }
}

async function waitBatch(batch: BatchJobsService, id: string) {
  for (;;) {
    const job = batch.get(id);
    if (job.state !== 'running') return job;
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function report(title: string, r: CalibrateResponseDto, scale: (t: number) => string = (t) => fmt(t)) {
  const o = r.threshold.optimal;
  log(`\n  ${title}`);
  log(`    данные        genuine ${r.sufficiency.positives}, impostor ${r.sufficiency.negatives}`);
  if (r.current)
    log(
      `    сейчас        τ = ${scale(r.current.tau)}: FAR ${pct(r.current.far)}, FRR ${pct(r.current.frr)}`,
    );
  log(`    оптимум τ*    τ = ${o.tau === null ? '—' : scale(o.tau)}: FAR ${pct(o.far)}, FRR ${pct(o.frr)}`);
  log(
    `    EER           ${pct(r.threshold.eer.far)} при τ = ${r.threshold.eer.tau === null ? '—' : scale(r.threshold.eer.tau)}`,
  );
  log(`    достаточность ${r.sufficiency.message}`);
}

async function run(): Promise<void> {
  const { values } = parseArgs({
    // «pnpm … calibrate -- --as admin» передаёт и сам разделитель «--».
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      as: { type: 'string', default: 'admin' },
      approve: { type: 'boolean', default: false },
      cache: { type: 'string', default: process.env.CALIBRATION_CACHE ?? '.calibration-cache' },
      'target-far': { type: 'string', default: '0.001' },
      'skip-face': { type: 'boolean', default: false },
      'skip-keystroke': { type: 'boolean', default: false },
    },
  });
  const targetFar = Number(values['target-far']);
  if (!(targetFar > 0 && targetFar < 1)) throw new Error('--target-far: число между 0 и 1');
  const cache = resolve(values.cache);

  loadDotEnv();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const user = await app.get<UserRepository>(USER_REPOSITORY).findByLogin(values.as);
    if (user?.role !== 'admin' || user.disabled)
      throw new Error(`--as ${values.as}: нужен действующий администратор`);
    const now = new Date();
    const actor: AuthUser = {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role,
      sessionId: 'cli',
      mfaComplete: true,
      amr: ['cli'],
      authTime: now,
      mfaAt: now,
    };
    const calibration = app.get(CalibrationService);
    const policies = app.get(PolicyService);
    // Только оценки этого прогона: старые попытки и прежние пакеты не смешиваются с открытыми наборами.
    const since = new Date(Date.now() - 1000).toISOString();
    const common = { to: null, costs: null, farMax: null, targetFar } as const;
    log(`Полная калибровка BioAuth · кэш наборов: ${cache}`);

    let face: CalibrateResponseDto | null = null;
    // Порог лица по открытому набору — по целевому FAR, а не τ* по стоимостям: снимки ORL сделаны в одной
    // студии, и genuine-оценки у них выше, чем у входа с веб-камеры; τ* в середине зазора между
    // распределениями (0,41) отвергал законных пользователей. Распределение злоумышленников переносимо.
    let faceTau: number | null = null;
    if (!values['skip-face']) {
      const files = await loadOrl(cache, (m) => log(`  ${m}`));
      const archive = storedZip(
        files.map((f) => ({
          path: `${f.subject}/${f.name.replace(/\.pgm$/, '.png')}`,
          data: pgmToPng(f.data),
        })),
      );
      const batch = app.get(BatchJobsService);
      const job = await waitBatch(
        batch,
        batch.start(actor, {
          archive,
          filename: 'orl-att-faces.zip',
          name: 'ORL (AT&T) — калибровка лица',
          seed: 0,
          maxImpostor: 100_000,
          includeInCalibration: true,
        }).id,
      );
      if (job.state !== 'done' || !job.result)
        throw new Error(`пакетная оценка лиц: ${job.error ?? job.state}`);
      log(
        `  bio-engine ${job.result.modelVersion}: ${job.result.imagesUsed}/${job.result.images} снимков, ` +
          `${job.result.genuineCount} genuine, ${job.result.impostorCount} impostor`,
      );
      face = await calibration.calibrate({
        modality: 'face',
        modelVersion: job.result.modelVersion,
        from: since,
        ...common,
      });
      const impostors = await app
        .get<CalibrationQuery>(CALIBRATION_QUERY)
        .scores('face', job.result.modelVersion, 'impostor', { from: new Date(since), to: null });
      faceTau = farTargetThreshold(impostors, targetFar);
    }

    let keystroke: CalibrateResponseDto | null = null;
    if (!values['skip-keystroke']) {
      const subjects = parseCmuKeystroke(await loadCmuKeystroke(cache, (m) => log(`  ${m}`)));
      const r = await app.get(KeystrokeBatchService).score(actor, {
        name: 'CMU Keystroke — калибровка ритма',
        subjects,
        includeInCalibration: true,
      });
      log(
        `  ритм набора ${KEYSTROKE_MODEL}: ${r.subjects} человек, ${r.genuine} genuine, ${r.impostor} impostor`,
      );
      keystroke = await calibration.calibrate({
        modality: 'keystroke',
        modelVersion: KEYSTROKE_MODEL,
        from: since,
        ...common,
      });
    }

    // PAD: подлинные предъявления с камеры нельзя заменить снимками — калибруем только по испытаниям UC-8.
    let pad: CalibrateResponseDto | null = null;
    const padVersion = (await app.get<CalibrationQuery>(CALIBRATION_QUERY).padScores(null)).version;
    if (padVersion) {
      try {
        pad = await calibration.calibrate({
          modality: 'pad',
          modelVersion: padVersion,
          from: null,
          ...common,
        });
      } catch (err) {
        log(`  PAD: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    log('\nРезультаты (ядро v1, стоимости активной политики)');
    if (face) {
      report('Лицо (τ_face, косинусное сходство)', face);
      log(
        `    применяется   τ = ${fmt(faceTau)} — наименьший порог с подтверждённым FAR ≤ ${fmt(targetFar)} ` +
          '(genuine-оценки студийного набора не переносятся на веб-камеру)',
      );
    }
    if (keystroke)
      report('Ритм набора (τ_kd, расстояние)', keystroke, (t) =>
        fmt(Math.min(4, Math.max(0.2, 4 * (1 - t)))),
      );
    if (pad) report('PAD (τ_pad, вероятность живого лица)', pad);
    else
      log(
        '\n  PAD: не откалиброван — запишите подлинные предъявления и атаки на странице «Алгоритм → PAD» ' +
          '(не менее 5 каждого вида) и запустите калибровку снова.',
      );

    const active = await policies.get((await calibration.overview()).activePolicy.id);
    const hasKd = active.steps.some((s) => s.factor === 'keystroke');
    const hasFace = active.steps.some((s) => s.factor === 'face');
    const id = (r: CalibrateResponseDto | null) =>
      r && r.threshold.optimal.tau !== null ? r.threshold.experimentId : null;
    const faceId = hasFace && faceTau !== null ? id(face) : null;
    const padId = hasFace ? id(pad) : null;
    // Слабый фактор при жёстких стоимостях даёт τ*, отвергающий почти всех: такой порог не применяется.
    const kdUsable = !!keystroke && keystroke.threshold.optimal.frr <= MAX_FRR;
    const kdId = hasKd && kdUsable ? id(keystroke) : null;
    if (!faceId && !padId && !kdId) {
      log(
        `\nПолитика v${active.version} не изменена: её шаги (${active.steps.map((s) => s.factor).join(' + ')}) ` +
          'не используют откалиброванные модальности. Эксперименты сохранены в «Алгоритм → История».',
      );
      return;
    }
    // Повторный прогон на тех же данных даёт те же τ*: новую версию политики не плодим.
    const same = (a: number | undefined, b: number | null | undefined) =>
      a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 1e-9;
    const faceStep = active.steps.find((s) => s.factor === 'face');
    const kdStep = active.steps.find((s) => s.factor === 'keystroke');
    const unchanged =
      (!faceId || (faceStep?.calibrated && same(faceStep.tauFace, faceTau))) &&
      (!padId || same(faceStep?.tauPad, pad?.threshold.optimal.tau)) &&
      (!kdId ||
        (kdStep?.calibrated &&
          same(kdStep.tauKd, Math.min(4, Math.max(0.2, 4 * (1 - (keystroke?.threshold.optimal.tau ?? 0)))))));
    if (unchanged) {
      log(`\nПолитика v${active.version} уже откалибрована на этих данных — новая версия не нужна.`);
      return;
    }
    const sources = [
      faceId && `лицо — ${ORL.name}`,
      kdId && `ритм — ${CMU_KEYSTROKE.name}`,
      padId && 'PAD — испытания UC-8',
    ].filter(Boolean);
    const proposed = await calibration.propose(actor, {
      faceExperimentId: faceId,
      ...(faceTau !== null ? { tauFace: faceTau } : {}),
      padExperimentId: padId,
      keystrokeExperimentId: kdId,
      rationale:
        `Полная калибровка (make calibrate)` +
        (faceId
          ? `: τ_face ${fmt(faceStep?.tauFace)} → ${fmt(faceTau)} (подтверждённый FAR ≤ ${fmt(targetFar)})`
          : '') +
        `; данные: ${sources.join('; ')}`,
    });
    log(`\nПредложена политика v${proposed.version}: ${proposed.rationale ?? ''}`);
    if (keystroke && !kdUsable)
      log(
        `  τ_kd не применён: при этих стоимостях FRR в оптимуме ${pct(keystroke.threshold.optimal.frr)} — ` +
          'ритм набора годится только как дополнительный фактор (эксперимент сохранён).',
      );
    else if (keystroke && !hasKd)
      log('  τ_kd не применён: в активной политике нет шага «ритм набора» (эксперимент сохранён).');
    if (values.approve) {
      try {
        const approved = await policies.approve(actor, proposed.id, 'make calibrate');
        log(`Политика v${approved.version} утверждена и действует.`);
      } catch (err) {
        log(
          `Не утверждена: ${err instanceof Error ? err.message : String(err)}. ` +
            'Утвердите её на странице «Администрирование → Политики».',
        );
      }
    } else {
      log('Утвердите её на странице «Администрирование → Политики» или запустите с --approve.');
    }
    log(`\nИсточники: ${ORL.citation} ${CMU_KEYSTROKE.citation}`);
  } finally {
    await app.close();
  }
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  },
);
