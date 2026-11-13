import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import type { CrossDeviceDetailsDto, CrossDeviceStartDto, CrossDeviceStatusDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../../shared/errors';
import { clientInfo } from '../../../shared/http/request-context';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { USER_REPOSITORY, type UserRepository } from '../../identity/application/ports';
import { type IssuedSession, SessionIssuer } from '../../identity/application/session-issuer';
import { TenantSettingsService } from '../../tenant/application/tenant-settings.service';

export const CROSS_DEVICE_STORE = Symbol('CROSS_DEVICE_STORE');

export interface CrossDeviceRow {
  readonly id: string;
  readonly pollHash: string;
  readonly approveHash: string;
  readonly number: number;
  readonly status: 'pending' | 'approved' | 'denied' | 'consumed';
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly createdAt: Date;
  readonly expiresAt: Date;
}

export interface CrossDeviceStore {
  create(r: {
    pollHash: string;
    approveHash: string;
    number: number;
    ip: string | null;
    userAgent: string | null;
    expiresAt: Date;
  }): Promise<string>;
  find(id: string): Promise<CrossDeviceRow | null>;
  /** pending → approved, только если запрос не истёк. */
  approve(id: string, userId: string, amr: readonly string[], mfa: boolean): Promise<boolean>;
  deny(id: string): Promise<boolean>;
  /** approved → consumed (один раз), только с верным секретом опроса и до истечения срока. */
  consume(id: string, pollHash: string): Promise<{ userId: string; amr: string[]; mfa: boolean } | null>;
}

/** Срок запроса: человек успевает достать телефон, а украденный QR-код быстро устаревает. */
export const REQUEST_TTL_MS = 2 * 60_000;
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');
const same = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Вход на компьютере с подтверждением на телефоне (#40, ADR-0023). Компьютер получает запрос и показывает QR-код;
 * телефон с действующей сессией (вход по лицу, passkey или коду не позднее 5 минут назад) выбирает число,
 * показанное на компьютере, и подтверждает. Компьютер забирает сессию один раз по секрету опроса.
 */
@Injectable()
export class CrossDeviceService {
  constructor(
    @Inject(CROSS_DEVICE_STORE) private readonly store: CrossDeviceStore,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly issuer: SessionIssuer,
    private readonly tenant: TenantSettingsService,
  ) {}

  async start(): Promise<CrossDeviceStartDto> {
    await this.tenant.assertCrossDeviceAllowed();
    const pollSecret = randomBytes(24).toString('base64url');
    const key = randomBytes(24).toString('base64url');
    const number = randomInt(10, 100);
    const expiresAt = new Date(Date.now() + REQUEST_TTL_MS);
    const { ip, userAgent } = clientInfo();
    const id = await this.store.create({
      pollHash: sha(pollSecret),
      approveHash: sha(key),
      number,
      ip,
      userAgent,
      expiresAt,
    });
    // Ключ — во фрагменте адреса (#k=…): браузер не отправляет его на сервер и в Referer.
    const approveUrl = `${this.config.RP_ORIGIN}/approve?r=${id}#k=${key}`;
    return { requestId: id, pollSecret, approveUrl, number, expiresAt: expiresAt.toISOString() };
  }

  async status(id: string, pollSecret: string): Promise<CrossDeviceStatusDto> {
    const r = await this.store.find(id);
    if (!r || !same(r.pollHash, sha(pollSecret))) throw new NotFoundError('запрос не найден');
    if (r.status !== 'consumed' && r.expiresAt.getTime() <= Date.now()) return { status: 'expired' };
    return { status: r.status };
  }

  async complete(id: string, pollSecret: string): Promise<IssuedSession> {
    const r = await this.store.consume(id, sha(pollSecret));
    if (!r) throw new ConflictError('вход не подтверждён на телефоне или запрос истёк');
    const user = await this.users.findById(r.userId);
    if (!user || user.disabled) throw new ForbiddenError('учётная запись недоступна');
    await this.audit.record({ actorId: r.userId, action: 'cross_device.completed', target: id });
    return this.issuer.issue(r.userId, r.mfa, { method: 'cross_device', amr: r.amr });
  }

  async details(user: AuthUser, id: string, key: string): Promise<CrossDeviceDetailsDto> {
    const r = await this.pending(id, key);
    const decoys = new Set<number>();
    while (decoys.size < 2) {
      const d = randomInt(10, 100);
      if (d !== r.number) decoys.add(d);
    }
    const choices = [r.number, ...decoys];
    for (let i = choices.length - 1; i > 0; i--) {
      const j = randomInt(0, i + 1);
      [choices[i], choices[j]] = [choices[j]!, choices[i]!];
    }
    return {
      requestId: r.id,
      userAgent: r.userAgent,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
      expiresAt: r.expiresAt.toISOString(),
      choices,
      needsReauth: !this.fresh(user),
    };
  }

  async approve(user: AuthUser, id: string, key: string, number: number | undefined): Promise<void> {
    const r = await this.pending(id, key);
    if (!this.fresh(user)) {
      throw new ForbiddenError(
        'подтвердите вход на этом телефоне: passkey или повторный вход не позднее 5 минут назад',
        'reauth-required',
      );
    }
    if (number !== r.number) {
      // Неверное число — возможно, человек подтверждает чужой компьютер: запрос аннулируется.
      await this.store.deny(id);
      await this.audit.record({
        actorId: user.id,
        action: 'cross_device.denied',
        target: id,
        details: { reason: 'number' },
      });
      throw new UnprocessableError(
        'число не совпало с показанным на компьютере — запрос отменён',
        'NUMBER_MISMATCH',
      );
    }
    if (!(await this.store.approve(id, user.id, user.amr, user.mfaComplete))) {
      throw new ConflictError('запрос уже обработан или истёк');
    }
    await this.audit.record({
      actorId: user.id,
      action: 'cross_device.approved',
      target: id,
      details: { ip: r.ip, userAgent: r.userAgent },
    });
  }

  async deny(user: AuthUser, id: string, key: string): Promise<void> {
    await this.pending(id, key);
    await this.store.deny(id);
    await this.audit.record({
      actorId: user.id,
      action: 'cross_device.denied',
      target: id,
      details: { reason: 'user' },
    });
  }

  private async pending(id: string, key: string): Promise<CrossDeviceRow> {
    const r = await this.store.find(id);
    if (!r || !same(r.approveHash, sha(key))) throw new NotFoundError('запрос не найден');
    if (r.status !== 'pending' || r.expiresAt.getTime() <= Date.now())
      throw new ConflictError('запрос уже обработан или истёк — начните вход на компьютере заново');
    return r;
  }

  /** Свежесть телефона: вход или второй фактор не раньше STEP_UP_MAX_AGE_SEC назад. */
  private fresh(user: AuthUser): boolean {
    const last = Math.max(user.authTime.getTime(), user.mfaAt?.getTime() ?? 0);
    return Date.now() - last <= this.config.STEP_UP_MAX_AGE_SEC * 1000;
  }
}
