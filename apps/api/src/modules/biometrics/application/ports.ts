import type {
  BioBatchResponse,
  BioLivenessRequest,
  BioLivenessResponse,
  BioTemplateResponse,
  BioVerifyResponse,
  FrameAnalysis,
} from '@bioauth/contracts';

import type {
  AttemptOutcomeDb,
  FactorDb,
  ModalityDb,
  SampleKindDb,
  SampleSourceDb,
} from '../../../shared/database/schema';

export const FACE_ENGINE = Symbol('FACE_ENGINE');
export const TEMPLATE_CIPHER = Symbol('TEMPLATE_CIPHER');
export const FACE_TEMPLATES = Symbol('FACE_TEMPLATES');
export const SCORE_SAMPLES = Symbol('SCORE_SAMPLES');
export const AUTH_ATTEMPTS = Symbol('AUTH_ATTEMPTS');
export const BIOMETRIC_ERASER = Symbol('BIOMETRIC_ERASER');

export interface Frame {
  readonly image: string;
  readonly ts?: number | null;
}

/** Порт сервиса распознавания (адаптер — HTTP-клиент к bio-engine). */
export interface FaceEngine {
  template(frames: readonly Frame[]): Promise<BioTemplateResponse>;
  verify(
    frames: readonly Frame[],
    template: { embedding: number[]; modelVersion: string },
  ): Promise<BioVerifyResponse>;
  liveness(req: BioLivenessRequest): Promise<BioLivenessResponse>;
  /** Пакетная оценка набора изображений (UC-9); отмена — через signal. */
  batchFace(archive: Buffer, opts: BatchFaceOptions, signal: AbortSignal): Promise<BioBatchResponse>;
}

export interface BatchFaceOptions {
  readonly seed: number;
  readonly maxImpostor: number;
}

/** Отказ bio-engine по содержанию кадров (нет лица, мало годных кадров) — не ошибка сервиса. */
export class FaceRejectedError extends Error {
  override name = 'FaceRejectedError';
  constructor(
    message: string,
    readonly code: 'NOT_ENOUGH_GOOD_FRAMES' | 'NO_USABLE_FRAMES' | 'INVALID_IMAGE',
    readonly frames: FrameAnalysis[],
  ) {
    super(message);
  }
}

export interface EncryptedTemplate {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly keyId: string;
  readonly cancelable: boolean;
}

/** Шифрование шаблонов AES-256-GCM (ADR-0014); при cancelable хранится отменяемая проекция P·e. */
export interface TemplateCipher {
  readonly activeKeyId: string;
  encrypt(userId: string, modelVersion: string, embedding: readonly number[]): EncryptedTemplate;
  decrypt(userId: string, modelVersion: string, t: EncryptedTemplate): number[];
}

export interface StoredTemplate extends EncryptedTemplate {
  readonly userId: string;
  readonly modelVersion: string;
  readonly samples: number;
}

export interface FaceTemplateRepository {
  upsert(t: StoredTemplate): Promise<{ replaced: boolean }>;
  find(userId: string): Promise<StoredTemplate | null>;
  /** Случайные шаблоны других субъектов той же версии модели — для impostor-оценок. */
  sampleOthers(userId: string | null, modelVersion: string, limit: number): Promise<StoredTemplate[]>;
  delete(userId: string): Promise<boolean>;
  all(): AsyncIterable<StoredTemplate>;
}

export interface ScoreSampleInput {
  readonly attemptId?: string | null;
  readonly userId?: string | null;
  readonly modality: ModalityDb;
  readonly kind: SampleKindDb;
  readonly score: number;
  readonly modelVersion: string;
  readonly source: SampleSourceDb;
  readonly attackType?: string | null;
}

export interface ScoreSampleRepository {
  add(samples: readonly ScoreSampleInput[]): Promise<void>;
}

export interface AttemptInput {
  readonly userId: string | null;
  readonly policyId: string | null;
  readonly sessionId: string | null;
  readonly factor: FactorDb;
  readonly outcome: AttemptOutcomeDb;
  readonly score?: number | null;
  readonly liveness?: number | null;
  readonly challengesOk?: boolean | null;
  readonly durationMs: number;
  readonly rejectReason?: string | null;
  readonly modelVersion?: string | null;
}

export interface AttemptRepository {
  add(a: AttemptInput): Promise<string>;
}

/** Удаление биометрии субъекта (UC-5): шаблон и passkey удаляются, оценки и попытки обезличиваются. */
export interface BiometricEraser {
  erase(
    userId: string,
  ): Promise<{ face: boolean; passkeys: number; samplesAnonymized: number; attemptsAnonymized: number }>;
}
