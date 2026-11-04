import {
  type BioLivenessRequest,
  type BioLivenessResponse,
  bioLivenessResponseSchema,
  bioProblemSchema,
  type BioTemplateResponse,
  bioTemplateResponseSchema,
  type BioVerifyResponse,
  bioVerifyResponseSchema,
  type z,
} from '@bioauth/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { ConflictError, ServiceUnavailableError } from '../../../shared/errors';
import { type FaceEngine, FaceRejectedError, type Frame } from '../application/ports';

const REJECTION_CODES = new Set(['NOT_ENOUGH_GOOD_FRAMES', 'NO_USABLE_FRAMES', 'INVALID_IMAGE']);

/**
 * HTTP-клиент bio-engine. Ответы проверяются zod-схемами контракта; сбой сети или 5xx повторяется один раз,
 * затем — 503. Отказ по содержанию кадров (422) — доменная ошибка FaceRejectedError, не сбой.
 * Кадры и эмбеддинги в лог не пишутся (NFR-B6).
 */
@Injectable()
export class HttpBioEngineAdapter implements FaceEngine {
  private readonly logger = new Logger('BioEngine');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  template(frames: readonly Frame[]): Promise<BioTemplateResponse> {
    return this.call('/v1/face/template', { frames: frames.map(toBio) }, bioTemplateResponseSchema);
  }

  verify(
    frames: readonly Frame[],
    template: { embedding: number[]; modelVersion: string },
  ): Promise<BioVerifyResponse> {
    return this.call('/v1/face/verify', { frames: frames.map(toBio), template }, bioVerifyResponseSchema);
  }

  liveness(req: BioLivenessRequest): Promise<BioLivenessResponse> {
    return this.call('/v1/face/liveness', req, bioLivenessResponseSchema);
  }

  private async call<S extends z.ZodType>(path: string, body: unknown, schema: S): Promise<z.output<S>> {
    const payload = JSON.stringify(body);
    for (let attempt = 1; ; attempt++) {
      let res: Response;
      try {
        res = await fetch(new URL(path, this.config.BIO_ENGINE_URL), {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-bio-secret': this.config.BIO_ENGINE_SECRET },
          body: payload,
          signal: AbortSignal.timeout(this.config.BIO_ENGINE_TIMEOUT_MS),
        });
      } catch (err) {
        if (attempt < 2) continue;
        this.logger.error({ path, err: (err as Error).name }, 'bio-engine недоступен');
        throw new ServiceUnavailableError('сервис распознавания недоступен, повторите позже');
      }
      if (res.status >= 500 && attempt < 2) continue;
      const json: unknown = await res.json().catch(() => null);
      if (res.ok) {
        const parsed = schema.safeParse(json);
        if (!parsed.success) {
          this.logger.error({ path }, 'ответ bio-engine не соответствует контракту');
          throw new ServiceUnavailableError('сервис распознавания вернул некорректный ответ');
        }
        return parsed.data;
      }
      const problem = bioProblemSchema.safeParse(json);
      if (res.status === 422 && problem.success && REJECTION_CODES.has(problem.data.code)) {
        throw new FaceRejectedError(
          problem.data.detail,
          problem.data.code as FaceRejectedError['code'],
          problem.data.frames ?? [],
        );
      }
      if (res.status === 409)
        throw new ConflictError('шаблон построен другой версией модели — зарегистрируйте лицо заново');
      this.logger.error(
        { path, status: res.status, code: problem.success ? problem.data.code : null },
        'ошибка bio-engine',
      );
      throw new ServiceUnavailableError('ошибка сервиса распознавания');
    }
  }
}

const toBio = (f: Frame) => ({ image: f.image, ts: f.ts ?? null });
