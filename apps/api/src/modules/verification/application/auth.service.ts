import { randomBytes } from 'node:crypto';

import type {
  AuthRejectReason,
  AuthSessionDto,
  AuthStepDto,
  AuthStepResultDto,
  FaceStep,
  KeystrokeSample,
  KeystrokeStep,
  LivenessCommand,
  PolicyFactor,
  PolicyStep,
  SubmitFaceRequest,
} from '@bioauth/contracts';
import { KEYSTROKE_PHRASE } from '@bioauth/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { ConflictError, NotFoundError, TooManyAttemptsError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  type AttemptRepository,
  AUTH_ATTEMPTS,
  FACE_ENGINE,
  FACE_TEMPLATES,
  type FaceEngine,
  FaceRejectedError,
  type FaceTemplateRepository,
  SCORE_SAMPLES,
  type ScoreSampleRepository,
  TEMPLATE_CIPHER,
  type TemplateCipher,
} from '../../biometrics/application/ports';
import { BackgroundTasks } from '../../biometrics/infrastructure/background-tasks';
import { USER_REPOSITORY, type UserRepository } from '../../identity/application/ports';
import { LOGIN_EVENTS, type LoginEvents } from '../../identity/application/ports';
import { type IssuedSession, SessionIssuer } from '../../identity/application/session-issuer';
import { KeystrokeService } from '../../keystroke/application/keystroke.service';
import { KEYSTROKE_MODEL } from '../../keystroke/domain/keystroke';
import { MfaService } from '../../mfa/application/mfa.service';
import { type ActivePolicy, POLICY_READER, type PolicyReader } from '../../policy/application/ports';
import {
  type CredentialRepository,
  CREDENTIALS,
  WEBAUTHN,
  type WebAuthnPort,
} from '../../webauthn/application/ports';
import { randomCommands } from './commands';
import { decideFace, REASON_MESSAGES } from './face-decision';
import { AUTH_SESSIONS, type AuthSessionRecord, type AuthSessionRepository } from './ports';

export const MAX_SESSION_FAILURES = 3;
export const USER_LOCK_THRESHOLD = 3;
export const USER_LOCK_MS = 15 * 60_000;
/** Кадров-подсказок позы на одну сессию входа (~4 в секунду в течение 2 минут). */
export const MAX_POSE_CHECKS = 500;
export const SESSION_TTL_MS = 3 * 60_000;

/** RFC 8176: face — лицо, hwk — ключ на устройстве, otp — одноразовый код; kbd — ритм набора (нестандартное). */
const AMR: Record<PolicyFactor, string> = { face: 'face', passkey: 'hwk', totp: 'otp', keystroke: 'kbd' };

export interface StepOutcome {
  readonly result: AuthStepResultDto;
  /** Выданная сессия, если вход завершён. */
  readonly session: IssuedSession | null;
}

const cosine = (a: readonly number[], b: readonly number[]): number => {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return Math.max(-1, Math.min(1, dot / Math.sqrt(na * nb)));
};

/**
 * Вход по активной политике (UC-4): сессия с nonce и случайными командами, шаги по порядку политики,
 * не более 3 неудач в сессии, блокировка логина после 3 неудачных попыток. Пороги и оценки клиенту
 * не возвращаются. Каждая попытка — в auth_attempt; оценки — в score_sample для калибровки.
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger('Auth');

  constructor(
    @Inject(AUTH_SESSIONS) private readonly sessions: AuthSessionRepository,
    @Inject(POLICY_READER) private readonly policies: PolicyReader,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(FACE_TEMPLATES) private readonly templates: FaceTemplateRepository,
    @Inject(TEMPLATE_CIPHER) private readonly cipher: TemplateCipher,
    @Inject(AUTH_ATTEMPTS) private readonly attempts: AttemptRepository,
    @Inject(SCORE_SAMPLES) private readonly samples: ScoreSampleRepository,
    @Inject(WEBAUTHN) private readonly webauthn: WebAuthnPort,
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly issuer: SessionIssuer,
    private readonly background: BackgroundTasks,
    private readonly mfa: MfaService,
    private readonly keystroke: KeystrokeService,
  ) {}

  // ── начало ──

  async start(login: string): Promise<AuthSessionDto> {
    const policy = await this.policies.active();
    const user = await this.users.findByLogin(login);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new TooManyAttemptsError(REASON_MESSAGES.LOCKED, user.lockedUntil);
    }
    // Для неизвестного логина создаётся «пустая» сессия того же вида: ответ не выдаёт, есть ли пользователь.
    const userId = user?.role === 'subject' && !user.disabled ? user.id : null;
    const commands = randomCommands(this.faceStep(policy)?.commands ?? 0);
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
    const id = await this.sessions.create({
      userId,
      policyId: policy.id,
      nonce: randomBytes(16).toString('hex'),
      commands,
      expiresAt,
    });
    return {
      sessionId: id,
      expiresAt: expiresAt.toISOString(),
      steps: await Promise.all(policy.steps.map((s) => this.stepDto(s, commands, userId))),
      currentStep: 0,
      attemptsLeft: MAX_SESSION_FAILURES,
      policyVersion: policy.version,
      calibrated: this.faceStep(policy)?.calibrated ?? true,
    };
  }

  // ── шаг «лицо» ──

  private readonly poseChecks = new Map<string, number>();

  /** Подсказки позы допустимы только в действующей сессии на шаге «лицо» и не чаще лимита на сессию. */
  async assertPoseAllowed(sessionId: string): Promise<void> {
    await this.current(sessionId, 'face');
    const n = (this.poseChecks.get(sessionId) ?? 0) + 1;
    if (n > MAX_POSE_CHECKS)
      throw new TooManyAttemptsError('слишком много кадров-подсказок в этой сессии', null);
    if (this.poseChecks.size > 10_000) this.poseChecks.clear();
    this.poseChecks.set(sessionId, n);
  }

  async submitFace(sessionId: string, body: SubmitFaceRequest): Promise<StepOutcome> {
    const started = Date.now();
    const { session, policy, step } = await this.current(sessionId, 'face');
    const face = step as FaceStep;
    const issued = session.commands;
    if (body.steps.length !== issued.length || body.steps.some((s, i) => s.command !== issued[i])) {
      throw new ValidationError('команды не совпадают с выданными в этой сессии', 'steps');
    }
    const stored = session.userId ? await this.templates.find(session.userId) : null;
    if (!session.userId || !stored) {
      return this.fail(session, policy, 'face', 'NO_MATCH', { durationMs: Date.now() - started });
    }
    const template = {
      embedding: this.cipher.decrypt(session.userId, stored.modelVersion, stored),
      modelVersion: stored.modelVersion,
    };
    // Сходство с шаблоном: нейтральные кадры и последний кадр каждой команды. bio-engine оставляет из них
    // фронтальные (кадр «ближе» обычно самый чёткий), повёрнутые — отбрасывает: они занижали медиану.
    const matchFrames = [...body.baseline, ...body.steps.map((s) => s.frames[s.frames.length - 1]!)];

    let liveness, verify;
    try {
      [liveness, verify] = await Promise.all([
        this.engine.liveness({ baseline: body.baseline, steps: body.steps }),
        this.engine.verify(matchFrames, template),
      ]);
    } catch (err) {
      if (err instanceof FaceRejectedError) {
        return this.fail(session, policy, 'face', 'FACE_QUALITY', {
          durationMs: Date.now() - started,
          countsForLock: false,
        });
      }
      throw err;
    }

    const decision = decideFace(face, issued, liveness, verify);
    const attemptId = await this.attempts.add({
      userId: session.userId,
      policyId: policy.id,
      sessionId: session.id,
      factor: 'face',
      outcome: decision.accepted ? 'accept' : 'reject',
      score: decision.score,
      liveness: decision.pLive,
      challengesOk: decision.challengesOk,
      durationMs: Date.now() - started,
      rejectReason: decision.reason,
      modelVersion: verify.modelVersion,
    });
    this.scheduleCrossImpostors(session.userId, attemptId, verify.probeEmbedding, verify.modelVersion);

    if (!decision.accepted) return this.fail(session, policy, 'face', decision.reason!, { recorded: true });
    return this.advance(session, policy, { faceAccepted: true });
  }

  // ── шаг «passkey» ──

  async passkeyOptions(sessionId: string): Promise<Record<string, unknown>> {
    const { session } = await this.current(sessionId, 'passkey');
    const creds = session.userId ? await this.credentials.listForUser(session.userId) : [];
    const { options, challenge } = await this.webauthn.authenticationOptions(creds);
    await this.sessions.setChallenge(session.id, challenge);
    return options;
  }

  async passkeyVerify(sessionId: string, response: { id: string }): Promise<StepOutcome> {
    const started = Date.now();
    const { session, policy } = await this.current(sessionId, 'passkey');
    const challenge = session.webauthnChallenge;
    await this.sessions.setChallenge(session.id, null); // вызов одноразовый
    const cred = await this.credentials.find(response.id);
    const ok =
      challenge && cred && session.userId && cred.userId === session.userId
        ? await this.webauthn.verifyAuthentication(response, challenge, cred)
        : null;
    if (!ok || !cred)
      return this.fail(session, policy, 'passkey', 'PASSKEY_FAILED', { durationMs: Date.now() - started });
    await this.credentials.touch(cred.credentialId, ok.newCounter);
    await this.attempts.add({
      userId: session.userId,
      policyId: policy.id,
      sessionId: session.id,
      factor: 'passkey',
      outcome: 'accept',
      durationMs: Date.now() - started,
    });
    // Вход по лицу, подтверждённый вторым фактором, — источник genuine-оценок (docs/10 §10.7).
    const face = await this.sessions.acceptedAttempt(session.id, 'face');
    if (face) {
      await this.samples.add([
        {
          attemptId: face.id,
          userId: session.userId,
          modality: 'face',
          kind: 'genuine',
          score: face.score,
          modelVersion: face.modelVersion,
          source: 'login',
        },
      ]);
    }
    return this.advance(session, policy, {});
  }

  /** Пользователь отменил церемонию (NotAllowedError) — учитывается в FRR фактора, но не в блокировке. */
  async passkeyCancel(sessionId: string, durationMs: number): Promise<StepOutcome> {
    const { session, policy } = await this.current(sessionId, 'passkey');
    await this.attempts.add({
      userId: session.userId,
      policyId: policy.id,
      sessionId: session.id,
      factor: 'passkey',
      outcome: 'cancel',
      durationMs,
      rejectReason: 'PASSKEY_FAILED',
    });
    return this.fail(session, policy, 'passkey', 'PASSKEY_FAILED', { recorded: true, countsForLock: false });
  }

  // ── шаг «код из приложения» (#48) ──

  async submitTotp(sessionId: string, code: string): Promise<StepOutcome> {
    const started = Date.now();
    const { session, policy } = await this.current(sessionId, 'totp');
    const r = session.userId ? await this.mfa.checkFactor(session.userId, code) : 'not-enrolled';
    const durationMs = Date.now() - started;
    if (r !== 'ok') {
      return this.fail(session, policy, 'totp', r === 'not-enrolled' ? 'NOT_ENROLLED' : 'TOTP_FAILED', {
        durationMs,
        // Блокировка самого TOTP (5 кодов) уже сработала — сессия входа завершается.
        ...(r === 'locked' ? { final: true } : {}),
      });
    }
    await this.attempts.add({
      userId: session.userId,
      policyId: policy.id,
      sessionId: session.id,
      factor: 'totp',
      outcome: 'accept',
      durationMs,
    });
    return this.advance(session, policy, {});
  }

  // ── шаг «ритм набора» (#48) ──

  async submitKeystroke(sessionId: string, sample: KeystrokeSample): Promise<StepOutcome> {
    const started = Date.now();
    const { session, policy, step } = await this.current(sessionId, 'keystroke');
    const tauKd = (step as KeystrokeStep).tauKd;
    const r = session.userId
      ? await this.keystroke.matchFactor(session.userId, sample, tauKd, this.config.CROSS_IMPOSTOR_LIMIT)
      : ({ kind: 'not-enrolled' } as const);
    const durationMs = Date.now() - started;
    if (r.kind === 'not-enrolled')
      return this.fail(session, policy, 'keystroke', 'NOT_ENROLLED', { durationMs });
    // Опечатка или исправление — не попытка подделки: в блокировку не засчитывается.
    if (r.kind === 'input') {
      return this.fail(session, policy, 'keystroke', 'KEYSTROKE_INPUT', { durationMs, countsForLock: false });
    }
    const attemptId = await this.attempts.add({
      userId: session.userId,
      policyId: policy.id,
      sessionId: session.id,
      factor: 'keystroke',
      outcome: r.accepted ? 'accept' : 'reject',
      score: r.score,
      durationMs,
      rejectReason: r.accepted ? undefined : 'KEYSTROKE_NO_MATCH',
      modelVersion: KEYSTROKE_MODEL,
    });
    // Impostor-оценки: этот ввод против шаблонов других людей с той же фразой (как перекрёстные оценки лица).
    this.background.run('keystroke-impostor', async () => {
      const scores = await r.impostorScores();
      await this.samples.add(
        scores.map((score) => ({
          attemptId,
          modality: 'keystroke' as const,
          kind: 'impostor' as const,
          score,
          modelVersion: KEYSTROKE_MODEL,
          source: 'cross' as const,
        })),
      );
    });
    if (!r.accepted) return this.fail(session, policy, 'keystroke', 'KEYSTROKE_NO_MATCH', { recorded: true });
    return this.advance(session, policy, {});
  }

  // ── общие шаги автомата ──

  private faceStep(policy: ActivePolicy): FaceStep | undefined {
    return policy.steps.find((s): s is FaceStep => s.factor === 'face');
  }

  private async stepDto(
    s: PolicyStep,
    commands: LivenessCommand[],
    userId: string | null,
  ): Promise<AuthStepDto> {
    switch (s.factor) {
      case 'face':
        return { factor: 'face', commands };
      case 'keystroke':
        // Для неизвестного логина — фраза по умолчанию: ответ не выдаёт, зарегистрирован ли ритм.
        return {
          factor: 'keystroke',
          phrase: (userId && (await this.keystroke.phraseOf(userId))) ?? KEYSTROKE_PHRASE,
        };
      case 'passkey':
      case 'totp':
        return { factor: s.factor };
    }
  }

  private async current(sessionId: string, factor: PolicyFactor) {
    const session = await this.sessions.find(sessionId);
    if (!session) throw new NotFoundError('сессия входа не найдена');
    if (session.state !== 'pending') throw new ConflictError('сессия входа уже завершена');
    if (session.expiresAt <= new Date()) {
      await this.sessions.update(session.id, session, { state: 'expired' });
      throw new ConflictError(REASON_MESSAGES.SESSION_EXPIRED);
    }
    const policy = await this.policies.findById(session.policyId);
    const step = policy?.steps[session.stepIndex];
    if (!policy || !step) throw new ConflictError('сессия входа в некорректном состоянии');
    if (step.factor !== factor) throw new ConflictError(`ожидается шаг «${step.factor}»`);
    return { session, policy, step };
  }

  private async advance(
    session: AuthSessionRecord,
    policy: ActivePolicy,
    patch: { faceAccepted?: boolean },
  ): Promise<StepOutcome> {
    const next = session.stepIndex + 1;
    const done = next >= policy.steps.length;
    const updated = await this.sessions.update(session.id, session, {
      ...patch,
      stepIndex: next,
      ...(done && { state: 'accepted' as const }),
    });
    if (!updated) throw new ConflictError('сессия входа изменена параллельным запросом');
    const result: AuthStepResultDto = {
      outcome: done ? 'accepted' : 'continue',
      reason: null,
      message: done ? 'Вход выполнен' : 'Шаг пройден',
      attemptsLeft: MAX_SESSION_FAILURES - session.failures,
      currentStep: next,
      lockedUntil: null,
      commands: null,
    };
    if (!done || !session.userId) return { result, session: null };
    await this.users.resetFailures(session.userId);
    const amr: string[] = [...new Set(policy.steps.map((s) => AMR[s.factor]))];
    if (amr.length > 1) amr.push('mfa');
    // Ритм набора, подтверждённый другим фактором, — genuine-оценка для калибровки τ_kd.
    if (policy.steps.length > 1) {
      const kd = await this.sessions.acceptedAttempt(session.id, 'keystroke');
      if (kd) {
        await this.samples.add([
          {
            attemptId: kd.id,
            userId: session.userId,
            modality: 'keystroke',
            kind: 'genuine',
            score: kd.score,
            modelVersion: KEYSTROKE_MODEL,
            source: 'login',
          },
        ]);
      }
    }
    const first = policy.steps.find((s) => s.factor === 'face') ?? policy.steps[0]!;
    return { result, session: await this.issuer.issue(session.userId, true, { method: first.factor, amr }) };
  }

  private async fail(
    session: AuthSessionRecord,
    policy: ActivePolicy,
    factor: PolicyFactor,
    reason: AuthRejectReason,
    opts: { durationMs?: number; recorded?: boolean; countsForLock?: boolean; final?: boolean },
  ): Promise<StepOutcome> {
    if (!opts.recorded) {
      await this.attempts.add({
        userId: session.userId,
        policyId: policy.id,
        sessionId: session.id,
        factor,
        outcome: reason === 'FACE_QUALITY' ? 'error' : 'reject',
        durationMs: opts.durationMs ?? 0,
        rejectReason: reason,
      });
    }
    if (session.userId) {
      await this.events.record({
        userId: session.userId,
        success: false,
        method: factor,
        amr: [AMR[factor]],
        reason,
      });
    }
    const failures = session.failures + 1;
    let lockedUntil: Date | null = null;
    if (session.userId && opts.countsForLock !== false) {
      const r = await this.users.registerFailure(
        session.userId,
        USER_LOCK_THRESHOLD,
        new Date(Date.now() + USER_LOCK_MS),
      );
      if (r.lockedUntil && r.lockedUntil > new Date()) {
        lockedUntil = r.lockedUntil;
        if (r.failures === USER_LOCK_THRESHOLD) {
          await this.audit.record({
            actorId: null,
            action: 'user.locked',
            target: session.userId,
            details: { failures: r.failures },
          });
        }
      }
    }
    const final = lockedUntil !== null || failures >= MAX_SESSION_FAILURES || opts.final === true;
    // Повтор — с новыми командами: записанное видео прошлой попытки не подойдёт.
    const commands = !final && factor === 'face' ? randomCommands(session.commands.length) : null;
    const updated = await this.sessions.update(session.id, session, {
      failures,
      ...(final ? { state: 'rejected' as const } : {}),
      ...(commands ? { commands } : {}),
    });
    if (!updated) throw new ConflictError('сессия входа изменена параллельным запросом');
    return {
      session: null,
      result: {
        outcome: lockedUntil ? 'locked' : final ? 'rejected' : 'retry',
        reason: lockedUntil ? 'LOCKED' : reason,
        message: lockedUntil ? REASON_MESSAGES.LOCKED : REASON_MESSAGES[reason],
        attemptsLeft: Math.max(0, MAX_SESSION_FAILURES - failures),
        currentStep: session.stepIndex,
        lockedUntil: lockedUntil?.toISOString() ?? null,
        commands,
      },
    };
  }

  /**
   * Impostor-оценки без дополнительного сбора данных: проба попытки сравнивается с K случайными
   * шаблонами других субъектов той же версии модели (docs/10 §10.7). Выполняется в фоне.
   */
  private scheduleCrossImpostors(
    userId: string,
    attemptId: string,
    probe: number[],
    modelVersion: string,
  ): void {
    const limit = this.config.CROSS_IMPOSTOR_LIMIT;
    if (limit === 0) return;
    this.background.run('cross-impostor', async () => {
      const others = await this.templates.sampleOthers(userId, modelVersion, limit);
      const scores = others.map((t) => cosine(probe, this.cipher.decrypt(t.userId, t.modelVersion, t)));
      await this.samples.add(
        scores.map((score) => ({
          attemptId,
          modality: 'face' as const,
          kind: 'impostor' as const,
          score,
          modelVersion,
          source: 'cross' as const,
        })),
      );
      if (scores.length) this.logger.debug({ attemptId, n: scores.length }, 'impostor-оценки добавлены');
    });
  }
}
