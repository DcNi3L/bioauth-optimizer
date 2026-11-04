import type {
  CalibrateResponseDto,
  CalibrationOverviewDto,
  FaceStep,
  MeasuredFactorsDto,
  PolicyStep,
  thresholdOptimizeRequestSchema,
  z,
} from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { canonicalJson, sha256Hex } from '../../../shared/canonical-json';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { NotFoundError, UnprocessableError } from '../../../shared/errors';
import { CreateFactorCatalogUseCase } from '../../factor-catalogs/application/factor-catalog.use-cases';
import { PolicyService } from '../../policy/application/policy.use-cases';
import { POLICY_READER, type PolicyReader } from '../../policy/application/ports';
import {
  SCORE_DATASET_REPOSITORY,
  type ScoreDatasetRepository,
} from '../../score-datasets/application/ports';
import { OptimizeThresholdUseCase } from '../../threshold/application/optimize-threshold.use-case';
import {
  CALIBRATION_QUERY,
  type CalibrationQuery,
  DRIFT_ALERTS,
  type DriftAlertRepository,
  type Period,
} from './ports';
import { confirmedRate, pointAt, quantile, wilson } from './stats';

type ThresholdCommand = z.output<typeof thresholdOptimizeRequestSchema>;

export const MIN_SAMPLES = 5;

export interface CalibrateCommand {
  readonly modality: 'face' | 'pad';
  readonly modelVersion: string;
  readonly from: string | null;
  readonly to: string | null;
  readonly costs: { cFA: number; cFR: number } | null;
  readonly farMax: number | null;
  readonly targetFar: number;
}

const period = (from: string | null, to: string | null): Period => ({
  from: from ? new Date(from) : null,
  to: to ? new Date(to) : null,
});

const fmt = (x: number) => x.toLocaleString('ru-RU', { maximumSignificantDigits: 4 });

/**
 * Замкнутый контур калибровки (docs/10 §10.7, ADR-0015): накопленные оценки → набор оценок v1 →
 * существующий сценарий «Оптимальный порог» ядра v1 (без изменений, OCP) → неизменяемый эксперимент →
 * предложение новой версии политики, которую утверждает администратор.
 */
@Injectable()
export class CalibrationService {
  constructor(
    @Inject(CALIBRATION_QUERY) private readonly query: CalibrationQuery,
    @Inject(DRIFT_ALERTS) private readonly drift: DriftAlertRepository,
    @Inject(SCORE_DATASET_REPOSITORY) private readonly datasets: ScoreDatasetRepository,
    @Inject(POLICY_READER) private readonly policies: PolicyReader,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly optimizeThreshold: OptimizeThresholdUseCase,
    private readonly policyService: PolicyService,
    private readonly createCatalog: CreateFactorCatalogUseCase,
  ) {}

  private static face(steps: readonly PolicyStep[]): FaceStep | undefined {
    return steps.find((s): s is FaceStep => s.factor === 'face');
  }

  async overview(): Promise<CalibrationOverviewDto> {
    const [data, policy, drift] = await Promise.all([
      this.query.overview(),
      this.policies.active(),
      this.drift.open(),
    ]);
    const face = CalibrationService.face(policy.steps);
    return {
      data,
      activePolicy: {
        id: policy.id,
        version: policy.version,
        tauFace: face?.tauFace ?? null,
        tauPad: face?.tauPad ?? null,
        calibrated: face?.calibrated ?? false,
        costs: policy.costs,
      },
      drift,
    };
  }

  async calibrate(cmd: CalibrateCommand): Promise<CalibrateResponseDto> {
    const p = period(cmd.from, cmd.to);
    const [modality, pos, neg] =
      cmd.modality === 'face'
        ? (['face', 'genuine', 'impostor'] as const)
        : (['pad', 'bonafide', 'attack'] as const);
    const [positives, negatives] = await Promise.all([
      this.query.scores(modality, cmd.modelVersion, pos, p),
      this.query.scores(modality, cmd.modelVersion, neg, p),
    ]);
    if (positives.length < MIN_SAMPLES || negatives.length < MIN_SAMPLES) {
      throw new UnprocessableError(
        `мало данных: ${positives.length} ${pos} и ${negatives.length} ${neg} (нужно не менее ${MIN_SAMPLES} каждого вида); ` +
          'накопите попытки или используйте пакетный режим',
        'NOT_ENOUGH_DATA',
      );
    }
    const policy = await this.policies.active();
    const costs = cmd.costs ?? policy.costs;

    // Набор оценок v1 (идемпотентно по содержимому): эксперимент ссылается на него и воспроизводим.
    const label = `${modality}:${cmd.modelVersion}`;
    const sha = sha256Hex(
      canonicalJson({
        label,
        p: [cmd.from, cmd.to],
        g: Array.from(positives).sort(),
        i: Array.from(negatives).sort(),
      }),
    );
    const datasetId = await this.datasets.saveIfAbsent({
      name: `Калибровка ${modality === 'face' ? 'лица' : 'PAD'} · ${cmd.modelVersion}`.slice(0, 200),
      originalFilename: `calibration-${modality}.scores`,
      sha256: sha,
      genuine: positives,
      impostor: negatives,
    });
    const command: ThresholdCommand = {
      model: { kind: 'empirical', datasetId },
      costs,
      constraints: { farMax: cmd.farMax },
      curve: { points: 200 },
    };
    const threshold = await this.optimizeThreshold.execute(command);

    const face = CalibrationService.face(policy.steps);
    const currentTau = modality === 'face' ? face?.tauFace : face?.tauPad;
    const current = currentTau === undefined ? null : pointAt(positives, negatives, currentTau, costs);
    const tau = threshold.optimal.tau ?? currentTau ?? 0;
    const at = pointAt(positives, negatives, tau, costs);
    const confirmedFar = confirmedRate(at.falseAccepts, negatives.length);
    const enough = confirmedFar <= cmd.targetFar;
    const needed = Math.ceil(3 / cmd.targetFar);
    return {
      modality: cmd.modality,
      modelVersion: cmd.modelVersion,
      datasetId,
      threshold,
      current: current && { tau: current.tau, far: current.far, frr: current.frr, cost: current.cost },
      sufficiency: {
        positives: positives.length,
        negatives: negatives.length,
        falseAccepts: at.falseAccepts,
        confirmedFar,
        targetFar: cmd.targetFar,
        enough,
        message: enough
          ? `Данных достаточно: FAR ≤ ${fmt(confirmedFar)} подтверждён с доверием 95 %.`
          : `Данные подтверждают лишь FAR ≤ ${fmt(confirmedFar)}; для FAR ≤ ${fmt(cmd.targetFar)} нужно не менее ${needed} ` +
            'сравнений злоумышленников без ложных допусков (правило трёх) — накопите попытки или используйте пакетный режим.',
      },
    };
  }

  /** Предложение политики: пороги из экспериментов калибровки подставляются в шаги активной политики. */
  async propose(
    user: AuthUser,
    cmd: { faceExperimentId: string | null; padExperimentId: string | null; rationale: string | null },
  ) {
    const policy = await this.policies.active();
    const face = CalibrationService.face(policy.steps);
    if (!face) throw new UnprocessableError('в активной политике нет шага «лицо»', 'NO_FACE_STEP');
    const load = async (id: string | null) => {
      if (!id) return null;
      const e = await this.query.thresholdExperiment(id);
      if (!e) throw new NotFoundError(`эксперимент ${id} не найден`);
      if (e.optimalTau === null) {
        throw new UnprocessableError(
          'оптимум вырожден: порог не имеет смысла при этих стоимостях',
          'DEGENERATE',
        );
      }
      return e;
    };
    const [fe, pe] = await Promise.all([load(cmd.faceExperimentId), load(cmd.padExperimentId)]);
    const next: FaceStep = {
      ...face,
      tauFace: fe?.optimalTau ?? face.tauFace,
      tauPad: pe?.optimalTau ?? face.tauPad,
      calibrated: true,
    };
    const parts = [
      fe && `τ_face ${fmt(face.tauFace)} → ${fmt(next.tauFace)}`,
      pe && `τ_pad ${fmt(face.tauPad)} → ${fmt(next.tauPad)}`,
    ].filter(Boolean);
    return this.policyService.propose(user, {
      steps: policy.steps.map((s) => (s.factor === 'face' ? next : s)),
      costs: fe?.costs ?? pe?.costs ?? policy.costs,
      rationale: cmd.rationale ?? `Калибровка по накопленным оценкам: ${parts.join(', ')}`,
      experimentId: fe?.id ?? pe?.id ?? null,
    });
  }

  /** Измеренный каталог факторов (UC-7): FAR, FRR и задержка по реальным попыткам вместо литературных значений. */
  async measuredFactors(from: string | null, to: string | null): Promise<MeasuredFactorsDto> {
    const p = period(from, to);
    const policy = await this.policies.active();
    const face = CalibrationService.face(policy.steps);
    const warnings: string[] = [];
    const factors: MeasuredFactorsDto['factors'] = [];
    const [stats, model] = await Promise.all([this.query.attemptStats(p), this.query.dominantFaceModel(p)]);

    if (face && model) {
      const [gen, imp, durations] = await Promise.all([
        this.query.scores('face', model, 'genuine', p),
        this.query.scores('face', model, 'impostor', p),
        this.query.attemptDurations('face', p),
      ]);
      const at = pointAt(gen, imp, face.tauFace, policy.costs);
      const frRejects = Math.round(at.frr * gen.length);
      if (imp.length < 3 / Math.max(at.far, 1e-9))
        warnings.push('FAR лица подтверждён не полностью: мало impostor-сравнений.');
      factors.push({
        code: 'FACE',
        name: `Лицо + проверка «живости» (${model})`,
        // Без impostor-сравнений верхняя граница FAR равна 1 — каталогу нужна вероятность < 1.
        far: Math.min(Math.max(confirmedRate(at.falseAccepts, imp.length), 1e-9), 0.999),
        frr: Math.min(at.frr, 0.999),
        latencyMs: quantile(durations, 0.5) ?? 0,
        cost: 1,
        hasPad: true,
        provenance: 'measured',
        attempts: gen.length,
        frrInterval: wilson(frRejects, gen.length),
        latencyP95Ms: quantile(durations, 0.95),
        sources: { far: 'measured', frr: 'measured', latency: 'measured' },
        confirmedFar: confirmedRate(at.falseAccepts, imp.length),
      });
    } else {
      warnings.push('Нет оценок лица: зарегистрируйте субъектов и накопите попытки входа.');
    }

    const pk = stats.find((s) => s.factor === 'passkey');
    if (pk && pk.total > 0) {
      const fails = pk.rejected + pk.cancelled;
      factors.push({
        code: 'PASSKEY',
        name: 'Passkey (отпечаток на устройстве)',
        far: this.config.PASSKEY_DECLARED_FAR,
        frr: Math.min(fails / pk.total, 0.999),
        latencyMs: pk.p50Ms ?? 0,
        cost: 1.5,
        hasPad: false,
        provenance: 'declared',
        attempts: pk.total,
        frrInterval: wilson(fails, pk.total),
        latencyP95Ms: pk.p95Ms,
        sources: { far: 'declared', frr: 'measured', latency: 'measured' },
        confirmedFar: null,
      });
    } else {
      warnings.push('Нет попыток passkey: FRR и задержка фактора пока не измерены.');
    }
    return { from, to, factors, warnings };
  }

  async createMeasuredCatalog(cmd: {
    name: string | null;
    from: string | null;
    to: string | null;
    costs: Record<string, number>;
  }) {
    const m = await this.measuredFactors(cmd.from, cmd.to);
    if (m.factors.length === 0) throw new UnprocessableError('нет измеренных факторов', 'NOT_ENOUGH_DATA');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    return this.createCatalog.execute({
      name: cmd.name ?? `Измеренный каталог ${stamp}`,
      description:
        'Создан по реальным попыткам системы (v2): FAR лица — верхняя 95%-граница по impostor-оценкам, FRR — доля ' +
        'отказов, задержка — медиана; FAR passkey — заявленное значение платформы. ' +
        m.warnings.join(' '),
      factors: m.factors.map((f) => ({
        code: f.code,
        name: f.name,
        far: f.far,
        frr: f.frr,
        latencyMs: Math.round(f.latencyMs),
        cost: cmd.costs[f.code] ?? f.cost,
        hasPad: f.hasPad,
        provenance: f.provenance ?? null,
      })),
    });
  }
}
