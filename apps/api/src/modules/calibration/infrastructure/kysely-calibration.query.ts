import type {
  AttemptDto,
  CalibrationDataDto,
  DriftAlertDto,
  thresholdOptimizeRequestSchema,
  z,
} from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { ModalityDb, SampleKindDb } from '../../../shared/database/schema';
import type {
  AttemptFilter,
  CalibrationQuery,
  DriftAlertInput,
  DriftAlertRepository,
  ExperimentSummary,
  FactorAttemptStats,
  Period,
} from '../application/ports';

type ThresholdInput = z.output<typeof thresholdOptimizeRequestSchema>;

@Injectable()
export class KyselyCalibrationQuery implements CalibrationQuery {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async overview(): Promise<CalibrationDataDto[]> {
    const rows = await this.db
      .selectFrom('score_sample')
      .select((eb) => [
        'modality',
        'model_version',
        'kind',
        'source',
        eb.fn.countAll<string>().as('n'),
        eb.fn.min('created_at').as('first_at'),
        eb.fn.max('created_at').as('last_at'),
      ])
      .groupBy(['modality', 'model_version', 'kind', 'source'])
      .execute();
    const map = new Map<string, CalibrationDataDto>();
    for (const r of rows) {
      const key = `${r.modality}|${r.model_version}`;
      const cur = map.get(key) ?? {
        modality: r.modality,
        modelVersion: r.model_version,
        positives: 0,
        negatives: 0,
        bySource: {},
        firstAt: null,
        lastAt: null,
      };
      const n = Number(r.n);
      const positive = r.kind === 'genuine' || r.kind === 'bonafide';
      const first = r.first_at.toISOString();
      const last = r.last_at.toISOString();
      map.set(key, {
        ...cur,
        positives: cur.positives + (positive ? n : 0),
        negatives: cur.negatives + (positive ? 0 : n),
        bySource: { ...cur.bySource, [`${r.source}:${r.kind}`]: n },
        firstAt: cur.firstAt === null || first < cur.firstAt ? first : cur.firstAt,
        lastAt: cur.lastAt === null || last > cur.lastAt ? last : cur.lastAt,
      });
    }
    return [...map.values()].sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''));
  }

  async scores(
    modality: ModalityDb,
    modelVersion: string,
    kind: SampleKindDb,
    p: Period,
  ): Promise<Float64Array> {
    let q = this.db
      .selectFrom('score_sample')
      .select('score')
      .where('modality', '=', modality)
      .where('model_version', '=', modelVersion)
      .where('kind', '=', kind);
    if (p.from) q = q.where('created_at', '>=', p.from);
    if (p.to) q = q.where('created_at', '<', p.to);
    const rows = await q.execute();
    return Float64Array.from(rows, (r) => r.score);
  }

  async padScores(padVersion: string | null) {
    const versions = (
      await this.db
        .selectFrom('score_sample')
        .select('model_version')
        .where('modality', '=', 'pad')
        .groupBy('model_version')
        .orderBy(sql`max(created_at)`, 'desc')
        .execute()
    ).map((r) => r.model_version);
    const version = padVersion ?? versions[0] ?? null;
    if (version === null) return { version, versions, rows: [] };
    const rows = await this.db
      .selectFrom('score_sample')
      .select(['kind', 'attack_type', 'score'])
      .where('modality', '=', 'pad')
      .where('model_version', '=', version)
      .execute();
    return {
      version,
      versions,
      rows: rows.map((r) => ({ kind: r.kind, attackType: r.attack_type, score: r.score })),
    };
  }

  async attempts(f: AttemptFilter) {
    let q = this.db
      .selectFrom('auth_attempt as a')
      .leftJoin('app_user as u', 'u.id', 'a.user_id')
      .leftJoin('auth_policy as p', 'p.id', 'a.policy_id')
      .select([
        'a.id',
        'a.created_at',
        'u.login',
        'a.factor',
        'a.outcome',
        'a.reject_reason',
        'a.score',
        'a.liveness',
        'a.challenges_ok',
        'a.duration_ms',
        'p.version',
        sql<string>`to_char(a.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`.as(
          'cursor_at',
        ),
      ])
      .orderBy('a.created_at', 'desc')
      .orderBy('a.id', 'desc')
      .limit(f.limit + 1);
    if (f.factor) q = q.where('a.factor', '=', f.factor);
    if (f.outcome) q = q.where('a.outcome', '=', f.outcome);
    if (f.from) q = q.where('a.created_at', '>=', f.from);
    if (f.to) q = q.where('a.created_at', '<', f.to);
    if (f.cursor) {
      const at = sql<Date>`${f.cursor.at}::timestamptz`;
      const id = f.cursor.id;
      q = q.where((eb) =>
        eb.or([eb('a.created_at', '<', at), eb.and([eb('a.created_at', '=', at), eb('a.id', '<', id)])]),
      );
    }
    const rows = await q.execute();
    return rows.map((r) => ({
      id: r.id,
      at: r.created_at,
      login: r.login,
      factor: r.factor,
      outcome: r.outcome,
      reason: r.reject_reason,
      score: r.score,
      liveness: r.liveness,
      challengesOk: r.challenges_ok,
      durationMs: r.duration_ms,
      policyVersion: r.version,
      cursorAt: r.cursor_at,
    })) satisfies (Omit<AttemptDto, 'at'> & { at: Date; cursorAt: string })[];
  }

  async attemptStats(p: Period): Promise<FactorAttemptStats[]> {
    let q = this.db
      .selectFrom('auth_attempt')
      .select((eb) => [
        'factor',
        eb.fn.countAll<string>().as('total'),
        sql<string>`count(*) FILTER (WHERE outcome = 'accept')`.as('accepted'),
        sql<string>`count(*) FILTER (WHERE outcome = 'reject')`.as('rejected'),
        sql<string>`count(*) FILTER (WHERE outcome = 'error')`.as('errors'),
        sql<string>`count(*) FILTER (WHERE outcome = 'cancel')`.as('cancelled'),
        sql<number | null>`percentile_cont(0.5) WITHIN GROUP (ORDER BY duration_ms)`.as('p50'),
        sql<number | null>`percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms)`.as('p95'),
      ])
      .groupBy('factor');
    if (p.from) q = q.where('created_at', '>=', p.from);
    if (p.to) q = q.where('created_at', '<', p.to);
    const rows = await q.execute();
    let rq = this.db
      .selectFrom('auth_attempt')
      .select((eb) => ['factor', 'reject_reason', eb.fn.countAll<string>().as('n')])
      .where('reject_reason', 'is not', null)
      .groupBy(['factor', 'reject_reason']);
    if (p.from) rq = rq.where('created_at', '>=', p.from);
    if (p.to) rq = rq.where('created_at', '<', p.to);
    const reasons = await rq.execute();
    return rows.map((r) => ({
      factor: r.factor,
      total: Number(r.total),
      accepted: Number(r.accepted),
      rejected: Number(r.rejected),
      errors: Number(r.errors),
      cancelled: Number(r.cancelled),
      p50Ms: r.p50,
      p95Ms: r.p95,
      byReason: Object.fromEntries(
        reasons.filter((x) => x.factor === r.factor).map((x) => [x.reject_reason ?? '', Number(x.n)]),
      ),
    }));
  }

  async attemptDurations(factor: 'face' | 'passkey', p: Period): Promise<number[]> {
    let q = this.db.selectFrom('auth_attempt').select('duration_ms').where('factor', '=', factor);
    if (p.from) q = q.where('created_at', '>=', p.from);
    if (p.to) q = q.where('created_at', '<', p.to);
    return (await q.execute()).map((r) => r.duration_ms);
  }

  async thresholdExperiment(id: string): Promise<ExperimentSummary | null> {
    const r = await this.db
      .selectFrom('experiment')
      .select(['id', 'input', 'result'])
      .where('id', '=', id)
      .where('type', '=', 'THRESHOLD')
      .executeTakeFirst();
    if (!r) return null;
    const input = r.input as ThresholdInput;
    const result = r.result as { optimal?: { tau?: number | null; frr?: number } };
    return {
      id: r.id,
      optimalTau: result.optimal?.tau ?? null,
      frr: result.optimal?.frr ?? null,
      costs: input.costs,
    };
  }

  async dominantFaceModel(p: Period): Promise<string | null> {
    let q = this.db
      .selectFrom('score_sample')
      .select((eb) => ['model_version', eb.fn.countAll<string>().as('n')])
      .where('modality', '=', 'face')
      .where('kind', '=', 'genuine')
      .groupBy('model_version')
      .orderBy('n', 'desc')
      .limit(1);
    if (p.from) q = q.where('created_at', '>=', p.from);
    if (p.to) q = q.where('created_at', '<', p.to);
    return (await q.executeTakeFirst())?.model_version ?? null;
  }
}

@Injectable()
export class KyselyDriftAlertRepository implements DriftAlertRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async add(a: DriftAlertInput): Promise<boolean> {
    const r = await this.db
      .insertInto('drift_alert')
      .values({
        policy_id: a.policyId,
        model_version: a.modelVersion,
        window_start: a.windowStart,
        window_end: a.windowEnd,
        baseline_frr: a.baselineFrr,
        recent_frr: a.recentFrr,
        samples: a.samples,
        z_score: a.zScore,
      })
      .onConflict((oc) => oc.columns(['policy_id', 'window_end']).doNothing())
      .executeTakeFirst();
    return (r.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async open(): Promise<DriftAlertDto[]> {
    const rows = await this.db
      .selectFrom('drift_alert as d')
      .innerJoin('auth_policy as p', 'p.id', 'd.policy_id')
      .selectAll('d')
      .select('p.version')
      .where('d.acknowledged_at', 'is', null)
      .orderBy('d.created_at', 'desc')
      .limit(20)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      policyVersion: r.version,
      modelVersion: r.model_version,
      windowStart: r.window_start.toISOString(),
      windowEnd: r.window_end.toISOString(),
      baselineFrr: r.baseline_frr,
      recentFrr: r.recent_frr,
      samples: r.samples,
      zScore: r.z_score,
      acknowledged: r.acknowledged_at !== null,
      createdAt: r.created_at.toISOString(),
    }));
  }

  async acknowledge(id: string, userId: string): Promise<boolean> {
    const r = await this.db
      .updateTable('drift_alert')
      .set({ acknowledged_by: userId, acknowledged_at: new Date() })
      .where('id', '=', id)
      .where('acknowledged_at', 'is', null)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }
}
