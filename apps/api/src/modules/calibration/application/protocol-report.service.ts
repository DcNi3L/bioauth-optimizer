import type { CostsDto, FaceStep, ProtocolReportDto, ProtocolRowDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { NotFoundError } from '../../../shared/errors';
import { POLICY_REPOSITORY, type PolicyRepository } from '../../policy/application/ports';
import { PadTestService } from './pad-test.service';
import { CALIBRATION_QUERY, type CalibrationQuery } from './ports';
import { confirmedRate, wilson } from './stats';

export interface ProtocolReportQuery {
  /** Версии политик для сравнения; по умолчанию — исходная (v1) и действующая. */
  readonly versions: readonly number[] | null;
  readonly modelVersion: string | null;
  /** Профиль стоимостей для E; по умолчанию — действующей политики, одинаковый для всех строк. */
  readonly costs: CostsDto | null;
}

const ALL_TIME = { from: null, to: null };

const rate = (k: number, n: number) => ({
  errors: k,
  total: n,
  rate: n ? k / n : null,
  interval: n ? wilson(k, n) : null,
});

/**
 * Протокол испытаний (docs/10 §10.11): FAR/FRR с 95%-интервалами Уилсона, подтверждённый FAR,
 * ожидаемые потери E и APCER/BPCER при порогах выбранных версий политики — на одних и тех же данных.
 * Так «до/после калибровки» сравнивается честно: меняется только порог.
 */
@Injectable()
export class ProtocolReportService {
  constructor(
    @Inject(CALIBRATION_QUERY) private readonly query: CalibrationQuery,
    @Inject(POLICY_REPOSITORY) private readonly policies: PolicyRepository,
    private readonly pad: PadTestService,
  ) {}

  async build(q: ProtocolReportQuery): Promise<ProtocolReportDto> {
    const all = await this.policies.list();
    const active = all.find((p) => p.status === 'active');
    if (!active) throw new NotFoundError('нет действующей политики');
    const versions = q.versions ?? [...new Set([1, active.version])];
    const chosen = versions.map((v) => {
      const p = all.find((x) => x.version === v);
      if (!p) throw new NotFoundError(`политика версии ${v} не найдена`);
      return p;
    });
    const costs = q.costs ?? active.costs;
    const modelVersion = q.modelVersion ?? (await this.query.dominantFaceModel(ALL_TIME));
    const [genuine, impostor] = modelVersion
      ? await Promise.all([
          this.query.scores('face', modelVersion, 'genuine', ALL_TIME),
          this.query.scores('face', modelVersion, 'impostor', ALL_TIME),
        ])
      : [new Float64Array(), new Float64Array()];

    let padVersion: string | null = null;
    const rows: ProtocolRowDto[] = [];
    for (const p of chosen) {
      const face = p.steps.find((s): s is FaceStep => s.factor === 'face');
      const tau = face?.tauFace ?? null;
      const tauPad = face?.tauPad ?? null;
      let fa = 0;
      let fr = 0;
      if (tau !== null) {
        for (const s of impostor) if (s >= tau) fa++;
        for (const s of genuine) if (s < tau) fr++;
      }
      const far = rate(fa, impostor.length);
      const frr = rate(fr, genuine.length);
      const padReport = tauPad === null ? null : await this.pad.report(null, tauPad);
      padVersion ??= padReport?.padVersion ?? null;
      rows.push({
        policyVersion: p.version,
        status: p.status,
        tauFace: tau,
        tauPad,
        far,
        frr,
        confirmedFar: impostor.length ? confirmedRate(fa, impostor.length) : null,
        cost: far.rate !== null && frr.rate !== null ? costs.cFA * far.rate + costs.cFR * frr.rate : null,
        bpcer: padReport?.bpcer ?? rate(0, 0),
        apcer: padReport?.apcer ?? [],
        apcerMax: padReport?.apcerMax ?? null,
      });
    }
    return {
      modelVersion,
      padVersion,
      costs,
      sampleSizes: { genuine: genuine.length, impostor: impostor.length },
      rows,
      generatedAt: new Date().toISOString(),
    };
  }
}
