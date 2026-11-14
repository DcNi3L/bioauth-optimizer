import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import type { CalibrateResponseDto } from '@bioauth/contracts';
import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import type { AuthUser } from '../../shared/auth/auth';
import { USER_REPOSITORY, type UserRepository } from '../identity/application/ports';
import { KEYSTROKE_MODEL } from '../keystroke/domain/keystroke';
import { PolicyService } from '../policy/application/policy.use-cases';
import { POLICY_REPOSITORY, type PolicyRepository } from '../policy/application/ports';
import { SCORE_SAMPLES_READER, type ScoreSamplesReader } from '../score-datasets/application/ports';
import { BatchJobsService } from './application/batch-jobs.service';
import { CalibrationService } from './application/calibration.service';
import {
  evaluateAt,
  holdoutCsv,
  holdoutMarkdown,
  type HoldoutReport,
  type HoldoutRow,
  pooled,
  splitSubjects,
} from './application/holdout-report';
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
/** τ_kd по умолчанию в форме политики (ADR-0022): строка «до», если шага ритма в политике нет. */
const DEFAULT_TAU_KD = 1.1;
/** Оценка ритма 1 − d/4 → расстояние τ_kd в допустимых пределах политики. */
const kdOf = (score: number) => Math.min(4, Math.max(0.2, 4 * (1 - score)));
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
      report: { type: 'string' },
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
    const costs = (await policies.get((await calibration.overview()).activePolicy.id)).costs;
    log(`Полная калибровка BioAuth · кэш наборов: ${cache}`);

    const reader = app.get<ScoreSamplesReader>(SCORE_SAMPLES_READER);
    const activeBefore = await policies.get((await calibration.overview()).activePolicy.id);
    const faceBefore = activeBefore.steps.find((st) => st.factor === 'face');
    const kdBefore = activeBefore.steps.find((st) => st.factor === 'keystroke');
    // «До» — исходная политика v1 (порог из рекомендации OpenCV); если действующая уже другая, она идёт отдельной
    // строкой: повторный прогон не должен показывать «до» = «после».
    const initial = (await app.get<PolicyRepository>(POLICY_REPOSITORY).list()).find((p) => p.version === 1);
    const faceInitial = initial?.steps.find((st) => st.factor === 'face');
    const holdout: HoldoutRow[] = [];
    const datasets: HoldoutReport['datasets'][number][] = [];

    let face: CalibrateResponseDto | null = null;
    // Порог лица по открытому набору — по целевому FAR, а не τ* по стоимостям: снимки ORL сделаны в одной
    // студии, и genuine-оценки у них выше, чем у входа с веб-камеры; τ* в середине зазора между
    // распределениями (0,41) отвергал законных пользователей. Распределение злоумышленников переносимо.
    let faceTau: number | null = null;
    if (!values['skip-face']) {
      const files = await loadOrl(cache, (m) => log(`  ${m}`));
      const bySubject = [...new Set(files.map((f) => f.subject))];
      const half = splitSubjects(bySubject);
      const batch = app.get(BatchJobsService);
      const score = async (subjects: string[], name: string, includeInCalibration: boolean) => {
        const archive = storedZip(
          files
            .filter((f) => subjects.includes(f.subject))
            .map((f) => ({
              path: `${f.subject}/${f.name.replace(/\.pgm$/, '.png')}`,
              data: pgmToPng(f.data),
            })),
        );
        const job = await waitBatch(
          batch,
          batch.start(actor, {
            archive,
            filename: 'orl-att-faces.zip',
            name,
            seed: 0,
            maxImpostor: 100_000,
            includeInCalibration,
          }).id,
        );
        if (job.state !== 'done' || !job.result)
          throw new Error(`пакетная оценка лиц: ${job.error ?? job.state}`);
        log(
          `  bio-engine ${job.result.modelVersion} (${name}): ${job.result.imagesUsed}/${job.result.images} снимков, ` +
            `${job.result.genuineCount} genuine, ${job.result.impostorCount} impostor`,
        );
        return job.result;
      };
      const calib = await score(bySubject, 'ORL (AT&T) — калибровка лица', true);
      face = await calibration.calibrate({
        modality: 'face',
        modelVersion: calib.modelVersion,
        from: since,
        ...common,
      });
      const impostors = await app
        .get<CalibrationQuery>(CALIBRATION_QUERY)
        .scores('face', calib.modelVersion, 'impostor', { from: new Date(since), to: null });
      faceTau = farTargetThreshold(impostors, targetFar);

      // Перекрёстная проверка по людям (2 блока): порог подбирается на 20 субъектах и проверяется на других 20,
      // затем наоборот. Блоки в калибровку не попадают — только в протокол.
      // Пакетные задачи выполняются по одной — блоки считаются последовательно.
      const block = async (subjects: string[], i: number) => {
        const r = await score(subjects, `ORL (AT&T) — протокол, блок ${i}`, false);
        const t = await reader.findSamples(r.datasetId);
        if (!t) throw new Error(`набор оценок ${r.datasetId} не найден`);
        return { ...t, datasetId: r.datasetId };
      };
      const b1 = await block(half.calibration, 1);
      const b2 = await block(half.test, 2);
      // «До» и «после» — на всей калибровочной выборке (на ней подтверждён FAR), перекрёстная проверка — по блокам.
      const all = await reader.findSamples(calib.datasetId);
      if (!all) throw new Error(`набор оценок ${calib.datasetId} не найден`);
      const at = (label: string, tau: number, applied: boolean) =>
        holdout.push({
          modality: 'face',
          label,
          tau,
          applied,
          ...evaluateAt(all.genuine, all.impostor, tau, costs),
        });
      if (faceInitial?.factor === 'face') at('до: исходная v1', faceInitial.tauFace, false);
      if (
        faceBefore?.factor === 'face' &&
        (activeBefore.version !== 1 || faceInitial?.factor !== 'face') &&
        !(faceInitial?.factor === 'face' && faceInitial.tauFace === faceBefore.tauFace)
      )
        at(`действовала: v${activeBefore.version}`, faceBefore.tauFace, true);
      if (faceTau !== null) at('после: целевой FAR (вся выборка)', faceTau, true);
      if (face.threshold.optimal.tau !== null)
        at('τ* по стоимостям (вся выборка)', face.threshold.optimal.tau, false);
      const t1 = farTargetThreshold(b1.impostor, targetFar);
      const t2 = farTargetThreshold(b2.impostor, targetFar);
      if (t1 !== null && t2 !== null) {
        holdout.push({
          modality: 'face',
          label: `перекрёстная проверка: τ ${fmt(t1)} / ${fmt(t2)}`,
          tau: (t1 + t2) / 2,
          applied: false,
          ...pooled(
            [evaluateAt(b2.genuine, b2.impostor, t1, costs), evaluateAt(b1.genuine, b1.impostor, t2, costs)],
            costs,
          ),
        });
      }
      datasets.push({
        modality: 'face',
        name: ORL.name,
        citation: ORL.citation,
        calibrationSubjects: bySubject.length,
        testSubjects: bySubject.length,
        testGenuine: all.genuine.length,
        testImpostor: all.impostor.length,
        calibrationExperimentId: face.threshold.experimentId,
        testDatasetId: `${calib.datasetId}; блоки ${b1.datasetId}, ${b2.datasetId}`,
      });
    }

    let keystroke: CalibrateResponseDto | null = null;
    if (!values['skip-keystroke']) {
      const subjects = parseCmuKeystroke(await loadCmuKeystroke(cache, (m) => log(`  ${m}`)));
      const kb = app.get(KeystrokeBatchService);
      const r = await kb.score(actor, {
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
      // Порог ритма в политику не подставляется (ADR-0027), поэтому строки протокола — на всей выборке.
      const t = await reader.findSamples(r.dataset.id);
      if (t) {
        const at = (label: string, kd: number, applied: boolean) =>
          holdout.push({
            modality: 'keystroke',
            label,
            tau: kd,
            applied,
            ...evaluateAt(t.genuine, t.impostor, 1 - kd / 4, costs),
          });
        const kd0 = kdBefore?.factor === 'keystroke' ? kdBefore.tauKd : DEFAULT_TAU_KD;
        at(kdBefore ? `до: v${activeBefore.version}` : 'до: по умолчанию', kd0, !!kdBefore);
        const opt = keystroke.threshold.optimal.tau;
        if (opt !== null) at('τ* по стоимостям', kdOf(opt), false);
        if (keystroke.threshold.eer.tau !== null) at('EER', kdOf(keystroke.threshold.eer.tau), false);
        datasets.push({
          modality: 'keystroke',
          name: CMU_KEYSTROKE.name,
          citation: CMU_KEYSTROKE.citation,
          calibrationSubjects: r.subjects,
          testSubjects: r.subjects,
          testGenuine: t.genuine.length,
          testImpostor: t.impostor.length,
          calibrationExperimentId: keystroke.threshold.experimentId,
          testDatasetId: r.dataset.id,
        });
      }
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
    if (keystroke) report('Ритм набора (τ_kd, расстояние)', keystroke, (t) => fmt(kdOf(t)));
    if (pad) report('PAD (τ_pad, вероятность живого лица)', pad);
    else
      log(
        '\n  PAD: не откалиброван — запишите подлинные предъявления и атаки на странице «Алгоритм → PAD» ' +
          '(не менее 5 каждого вида) и запустите калибровку снова.',
      );

    const decide = async (): Promise<number> => {
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
        return active.version;
      }
      // Повторный прогон на тех же данных даёт те же τ*: новую версию политики не плодим.
      const same = (a: number | undefined, b: number | null | undefined) =>
        a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 1e-9;
      const faceStep = active.steps.find((s) => s.factor === 'face');
      const kdStep = active.steps.find((s) => s.factor === 'keystroke');
      const unchanged =
        (!faceId || (faceStep?.calibrated && same(faceStep.tauFace, faceTau))) &&
        (!padId || same(faceStep?.tauPad, pad?.threshold.optimal.tau)) &&
        (!kdId || (kdStep?.calibrated && same(kdStep.tauKd, kdOf(keystroke?.threshold.optimal.tau ?? 0))));
      if (unchanged) {
        log(`\nПолитика v${active.version} уже откалибрована на этих данных — новая версия не нужна.`);
        return active.version;
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
          return approved.version;
        } catch (err) {
          log(
            `Не утверждена: ${err instanceof Error ? err.message : String(err)}. ` +
              'Утвердите её на странице «Администрирование → Политики».',
          );
        }
      } else {
        log('Утвердите её на странице «Администрирование → Политики» или запустите с --approve.');
      }
      return active.version;
    };
    const after = await decide();

    if (holdout.length) {
      const reportDir = resolve(values.report ?? join(cache, 'report'));
      const rep: HoldoutReport = {
        generatedAt: new Date().toISOString(),
        costs,
        targetFar,
        policy: { before: initial?.version ?? activeBefore.version, after },
        datasets,
        rows: holdout,
      };
      await mkdir(reportDir, { recursive: true });
      const md = holdoutMarkdown(rep);
      await writeFile(join(reportDir, 'protocol.json'), `${JSON.stringify(rep, null, 2)}\n`);
      await writeFile(join(reportDir, 'protocol.csv'), holdoutCsv(rep));
      await writeFile(join(reportDir, 'protocol.md'), md);
      log(`\nПротокол «до/после» (${reportDir}: protocol.md, .csv, .json):\n`);
      log(md.slice(md.indexOf('## Таблица 1'), md.indexOf('## Источники')).trimEnd());
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
