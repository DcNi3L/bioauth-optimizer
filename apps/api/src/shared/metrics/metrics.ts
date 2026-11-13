import { timingSafeEqual } from 'node:crypto';

import {
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  Headers,
  Inject,
  Injectable,
  type NestInterceptor,
  Res,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { sql } from 'kysely';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import type { Observable } from 'rxjs';

import { Public } from '../auth/auth';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { type Db, KYSELY } from '../database/kysely';
import { NotFoundError, UnauthorizedError } from '../errors';

/**
 * Метрики Prometheus (#44). HTTP — счётчики процесса; доменные (входы, попытки, отказы PAD, дрейф) — снимок из базы на
 * момент опроса, поэтому совпадают при нескольких экземплярах API и переживают перезапуск.
 */
@Injectable()
export class Metrics {
  readonly registry = new Registry();
  readonly httpRequests: Counter<'method' | 'route' | 'status'>;
  readonly httpDuration: Histogram<'method' | 'route'>;

  constructor(@Inject(KYSELY) db: Db) {
    collectDefaultMetrics({ register: this.registry, prefix: 'bioauth_api_' });
    this.httpRequests = new Counter({
      name: 'bioauth_http_requests_total',
      help: 'HTTP-запросы по шаблону маршрута и коду ответа',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });
    this.httpDuration = new Histogram({
      name: 'bioauth_http_request_duration_seconds',
      help: 'Длительность HTTP-запросов',
      labelNames: ['method', 'route'],
      buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });
    new Gauge({
      name: 'bioauth_login_events',
      help: 'Входы в базе по способу и исходу (монотонно растёт, пока журнал входов не очищают)',
      labelNames: ['method', 'success'],
      registers: [this.registry],
      async collect() {
        const rows = await db
          .selectFrom('login_event')
          .select((eb) => ['method', 'success', eb.fn.countAll<string>().as('n')])
          .groupBy(['method', 'success'])
          .execute();
        this.reset();
        for (const r of rows) this.set({ method: r.method, success: String(r.success) }, Number(r.n));
      },
    });
    new Gauge({
      name: 'bioauth_auth_attempts',
      help: 'Попытки шагов входа по фактору, исходу и причине отказа (PAD — LIVENESS_*)',
      labelNames: ['factor', 'outcome', 'reason'],
      registers: [this.registry],
      async collect() {
        const rows = await db
          .selectFrom('auth_attempt')
          .select((eb) => ['factor', 'outcome', 'reject_reason', eb.fn.countAll<string>().as('n')])
          .groupBy(['factor', 'outcome', 'reject_reason'])
          .execute();
        this.reset();
        for (const r of rows) {
          this.set({ factor: r.factor, outcome: r.outcome, reason: r.reject_reason ?? '' }, Number(r.n));
        }
      },
    });
    new Gauge({
      name: 'bioauth_drift_alerts_open',
      help: 'Неподтверждённые уведомления о росте FRR',
      registers: [this.registry],
      async collect() {
        const r = await db
          .selectFrom('drift_alert')
          .select((eb) => eb.fn.countAll<string>().as('n'))
          .where('acknowledged_at', 'is', null)
          .executeTakeFirst();
        this.set(Number(r?.n ?? 0));
      },
    });
    new Gauge({
      name: 'bioauth_sessions_active',
      help: 'Действующие сессии пользователей',
      registers: [this.registry],
      async collect() {
        const r = await sql<{
          n: string;
        }>`SELECT count(*)::text AS n FROM user_session WHERE expires_at > now()`.execute(db);
        this.set(Number(r.rows[0]?.n ?? 0));
      },
    });
  }
}

/** Маршрут — шаблон (`/api/v1/admin/users/:id`), а не фактический путь: иначе метки разрастаются без предела. */
@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  constructor(private readonly metrics: Metrics) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request>();
    const res = ctx.switchToHttp().getResponse<Response>();
    const end = this.metrics.httpDuration.startTimer();
    res.once('finish', () => {
      const route = `${req.baseUrl}${(req.route as { path?: string } | undefined)?.path ?? ''}` || 'unknown';
      if (route === '/metrics') return;
      end({ method: req.method, route });
      this.metrics.httpRequests.inc({ method: req.method, route, status: String(res.statusCode) });
    });
    return next.handle();
  }
}

/**
 * `GET /metrics` в формате Prometheus. С METRICS_TOKEN — только с `Authorization: Bearer <token>`;
 * без токена открыт вне production и скрыт (404) в production.
 */
@ApiExcludeController()
@Public()
@Controller('metrics')
export class MetricsController {
  constructor(
    private readonly metrics: Metrics,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get()
  async scrape(
    @Headers('authorization') auth: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const token = this.config.METRICS_TOKEN;
    if (token) {
      const given = Buffer.from(auth?.replace(/^Bearer\s+/i, '') ?? '');
      const want = Buffer.from(token);
      if (given.length !== want.length || !timingSafeEqual(given, want))
        throw new UnauthorizedError('нужен токен метрик');
    } else if (this.config.NODE_ENV === 'production') {
      throw new NotFoundError('метрики не включены: задайте METRICS_TOKEN');
    }
    res.setHeader('Content-Type', this.metrics.registry.contentType);
    res.setHeader('Cache-Control', 'no-store');
    return this.metrics.registry.metrics();
  }
}
