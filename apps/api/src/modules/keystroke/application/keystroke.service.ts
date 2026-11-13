import type { KeystrokeSample, KeystrokeStatusDto, KeystrokeVerifyResultDto } from '@bioauth/contracts';
import { KEYSTROKE_ENROLL_SAMPLES, KEYSTROKE_PHRASE } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { SECRET_BOX, type SecretBox } from '../../../shared/crypto/secret-box';
import { NotFoundError, TooManyAttemptsError, UnprocessableError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { CONSENT_CHECKER, type ConsentChecker } from '../../consent/application/consent.use-cases';
import {
  buildTemplate,
  consistency,
  DEFAULT_THRESHOLD,
  distance,
  extractFeatures,
  parseTemplate,
  SampleError,
  scoreOf,
  serializeTemplate,
} from '../domain/keystroke';
import { KEYSTROKE_REPOSITORY, type KeystrokeRepository } from './ports';

const PURPOSE = 'keystroke';
/** Пять отказов подряд — пауза на 5 минут: ритм не пароль, подбирать его повторами нельзя. */
const MAX_FAILURES = 5;
const LOCK_MS = 5 * 60_000;
const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/**
 * Динамика набора текста: регистрация ритма по нескольким повторам фразы и проверка нового ввода.
 * Шаблон шифруется AES-256-GCM, требуется согласие на обработку биометрии, удаляется вместе с ним.
 */
@Injectable()
export class KeystrokeService {
  constructor(
    @Inject(KEYSTROKE_REPOSITORY) private readonly repo: KeystrokeRepository,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(CONSENT_CHECKER) private readonly consent: ConsentChecker,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  protected now(): number {
    return Date.now();
  }

  async status(user: AuthUser): Promise<KeystrokeStatusDto> {
    const row = await this.repo.get(user.id);
    return {
      enrolled: !!row,
      samples: row?.samples ?? 0,
      updatedAt: row?.updatedAt.toISOString() ?? null,
      phrase: row?.phrase ?? KEYSTROKE_PHRASE,
      required: KEYSTROKE_ENROLL_SAMPLES,
    };
  }

  async enroll(user: AuthUser, samples: readonly KeystrokeSample[]) {
    await this.consent.require(user.id);
    const vectors = samples.map((s, i) => this.features(s, KEYSTROKE_PHRASE, i + 1));
    const template = buildTemplate(vectors);
    await this.repo.save(
      user.id,
      this.box.seal(PURPOSE, user.id, serializeTemplate(template)),
      vectors.length,
      KEYSTROKE_PHRASE,
    );
    await this.audit.record({
      actorId: user.id,
      action: 'keystroke.enrolled',
      target: user.id,
      details: { samples: vectors.length },
    });
    return {
      enrolled: true as const,
      samples: vectors.length,
      consistency: round3(consistency(template, vectors)),
    };
  }

  async verify(user: AuthUser, sample: KeystrokeSample): Promise<KeystrokeVerifyResultDto> {
    const row = await this.repo.get(user.id);
    if (!row) throw new NotFoundError('ритм набора не зарегистрирован');
    if (row.lockedUntil && row.lockedUntil.getTime() > this.now())
      throw new TooManyAttemptsError(
        'слишком много неудачных проверок — подождите несколько минут',
        row.lockedUntil,
      );
    const template = parseTemplate(this.box.open(PURPOSE, user.id, row.sealed));
    const d = distance(template, this.features(sample, row.phrase));
    const accepted = d <= DEFAULT_THRESHOLD;
    if (accepted) await this.repo.resetFailures(user.id);
    else {
      const r = await this.repo.registerFailure(user.id, MAX_FAILURES, new Date(this.now() + LOCK_MS));
      if (r.lockedUntil)
        await this.audit.record({
          actorId: user.id,
          action: 'user.locked',
          target: user.id,
          details: { factor: 'keystroke' },
        });
    }
    return { accepted, distance: round3(d), threshold: DEFAULT_THRESHOLD, score: round3(scoreOf(d)) };
  }

  async remove(user: AuthUser): Promise<void> {
    if (!(await this.repo.delete(user.id))) throw new NotFoundError('ритм набора не зарегистрирован');
    await this.audit.record({ actorId: user.id, action: 'keystroke.deleted', target: user.id });
  }

  private features(sample: KeystrokeSample, phrase: string, n?: number): number[] {
    try {
      return extractFeatures(sample.events, phrase);
    } catch (err) {
      if (err instanceof SampleError)
        throw new UnprocessableError(
          n ? `повтор ${n}: ${err.message}` : err.message,
          `KEYSTROKE_${err.issue}`,
        );
      throw err;
    }
  }
}
