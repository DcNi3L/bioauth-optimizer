import type { FaceStep } from '@bioauth/contracts';
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import {
  POLICY_READER,
  POLICY_REPOSITORY,
  type PolicyReader,
  type PolicyRepository,
} from '../../policy/application/ports';
import { CALIBRATION_QUERY, type CalibrationQuery, DRIFT_ALERTS, type DriftAlertRepository } from './ports';
import { binomialZ, pointAt } from './stats';

export const MIN_DRIFT_SAMPLES = 30;
export const DRIFT_Z = 2;

export type DriftCheck =
  | { status: 'skipped'; reason: string }
  | {
      status: 'ok' | 'alert';
      baselineFrr: number;
      recentFrr: number;
      samples: number;
      zScore: number;
      created: boolean;
    };

/**
 * Дрейф FRR (docs/10 §10.7): FRR genuine-оценок за последние N дней при пороге активной политики
 * сравнивается с FRR набора, на котором политика калибровалась. Отклонение больше 2σ (биномиально) —
 * уведомление администратору. Проверка идемпотентна: одно уведомление на политику за день.
 */
@Injectable()
export class DriftService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger('Drift');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(POLICY_READER) private readonly policies: PolicyReader,
    @Inject(POLICY_REPOSITORY) private readonly policyRepo: PolicyRepository,
    @Inject(CALIBRATION_QUERY) private readonly query: CalibrationQuery,
    @Inject(DRIFT_ALERTS) private readonly alerts: DriftAlertRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  onApplicationBootstrap(): void {
    const hours = this.config.DRIFT_CHECK_HOURS;
    if (hours <= 0 || this.config.NODE_ENV === 'test') return;
    this.timer = setInterval(() => {
      this.check().catch((err: unknown) =>
        this.logger.error({ err: (err as Error).message }, 'проверка дрейфа не выполнена'),
      );
    }, hours * 3600_000);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async check(now = new Date()): Promise<DriftCheck> {
    const policy = await this.policies.active();
    const face = policy.steps.find((s): s is FaceStep => s.factor === 'face');
    const dto = await this.policyRepo.get(policy.id);
    if (!face?.calibrated || !dto?.experimentId)
      return { status: 'skipped', reason: 'активная политика не откалибрована' };
    const exp = await this.query.thresholdExperiment(dto.experimentId);
    if (exp?.frr === null || exp?.frr === undefined)
      return { status: 'skipped', reason: 'нет FRR калибровки' };
    const windowEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const windowStart = new Date(windowEnd.getTime() - this.config.DRIFT_WINDOW_DAYS * 86_400_000);
    const period = { from: windowStart, to: now };
    const model = await this.query.dominantFaceModel(period);
    if (!model) return { status: 'skipped', reason: 'нет genuine-оценок за период' };
    const genuine = await this.query.scores('face', model, 'genuine', period);
    if (genuine.length < MIN_DRIFT_SAMPLES) {
      return { status: 'skipped', reason: `мало genuine-оценок: ${genuine.length} < ${MIN_DRIFT_SAMPLES}` };
    }
    const recent = pointAt(genuine, [], face.tauFace, policy.costs).frr;
    // Нулевой FRR калибровки делает тест вырожденным: берётся поправка Лапласа 1/(n+2).
    const p0 = Math.min(Math.max(exp.frr, 1 / (genuine.length + 2)), 1 - 1 / (genuine.length + 2));
    const z = binomialZ(Math.round(recent * genuine.length), genuine.length, p0);
    const base = { baselineFrr: exp.frr, recentFrr: recent, samples: genuine.length, zScore: z };
    if (Math.abs(z) <= DRIFT_Z) return { status: 'ok', ...base, created: false };
    const created = await this.alerts.add({
      policyId: policy.id,
      modelVersion: model,
      windowStart,
      windowEnd,
      ...base,
    });
    if (created) this.logger.warn(base, 'обнаружен дрейф FRR');
    return { status: 'alert', ...base, created };
  }
}
