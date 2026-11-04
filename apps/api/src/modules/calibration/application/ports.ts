import type { AttemptDto, CalibrationDataDto, DriftAlertDto } from '@bioauth/contracts';

import type { ModalityDb, SampleKindDb } from '../../../shared/database/schema';

export const CALIBRATION_QUERY = Symbol('CALIBRATION_QUERY');
export const DRIFT_ALERTS = Symbol('DRIFT_ALERTS');

export interface Period {
  readonly from: Date | null;
  readonly to: Date | null;
}

export interface AttemptFilter extends Period {
  readonly factor: 'face' | 'passkey' | null;
  readonly outcome: 'accept' | 'reject' | 'error' | 'cancel' | null;
  readonly limit: number;
  /** Курсор с точностью до микросекунд (timestamptz), иначе записи одной миллисекунды теряются. */
  readonly cursor: { at: string; id: string } | null;
}

export interface FactorAttemptStats {
  readonly factor: 'face' | 'passkey';
  readonly total: number;
  readonly accepted: number;
  readonly rejected: number;
  readonly errors: number;
  readonly cancelled: number;
  readonly p50Ms: number | null;
  readonly p95Ms: number | null;
  readonly byReason: Record<string, number>;
}

export interface ExperimentSummary {
  readonly id: string;
  readonly optimalTau: number | null;
  readonly frr: number | null;
  readonly costs: { cFA: number; cFR: number };
}

/** Сторона чтения калибровки: агрегаты score_sample и auth_attempt одним запросом на вопрос. */
export interface CalibrationQuery {
  overview(): Promise<CalibrationDataDto[]>;
  scores(
    modality: ModalityDb,
    modelVersion: string,
    kind: SampleKindDb,
    period: Period,
  ): Promise<Float64Array>;
  padScores(padVersion: string | null): Promise<{
    version: string | null;
    versions: string[];
    rows: { kind: SampleKindDb; attackType: string | null; score: number }[];
  }>;
  attempts(filter: AttemptFilter): Promise<(Omit<AttemptDto, 'at'> & { at: Date; cursorAt: string })[]>;
  attemptStats(period: Period): Promise<FactorAttemptStats[]>;
  attemptDurations(factor: 'face' | 'passkey', period: Period): Promise<number[]>;
  thresholdExperiment(id: string): Promise<ExperimentSummary | null>;
  /** Версия модели с наибольшим числом genuine-оценок лица за период. */
  dominantFaceModel(period: Period): Promise<string | null>;
}

export interface DriftAlertInput {
  readonly policyId: string;
  readonly modelVersion: string;
  readonly windowStart: Date;
  readonly windowEnd: Date;
  readonly baselineFrr: number;
  readonly recentFrr: number;
  readonly samples: number;
  readonly zScore: number;
}

export interface DriftAlertRepository {
  /** Идемпотентно по (политика, конец окна); true — уведомление создано. */
  add(a: DriftAlertInput): Promise<boolean>;
  open(): Promise<DriftAlertDto[]>;
  acknowledge(id: string, userId: string): Promise<boolean>;
}
