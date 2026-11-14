import { parseArgs } from 'node:util';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../../app.module';
import { AdminQuery } from '../admin/infrastructure/admin.query';
import { AUDIT_LOG, type AuditLog } from '../audit/application/audit-log';
import { USER_REPOSITORY, type UserRepository } from '../identity/application/ports';
import { ConsentService } from './application/consent.use-cases';

/**
 * Завершение испытания (docs/10 §10.11, docs/protocol/02-operator-checklist.md): отзыв согласий участников —
 * биометрия удаляется, статистика обезличивается (UC-5), каждое удаление и итог записываются в аудит.
 *
 *   pnpm --filter @bioauth/api protocol-cleanup --prefix p26- --as admin           # показать, кого затронет
 *   pnpm --filter @bioauth/api protocol-cleanup --prefix p26- --as admin --yes     # выполнить
 *   make protocol-cleanup PREFIX=p26-                                               # в контейнере api
 *
 * Затрагиваются только участники (роль subject), чей логин начинается с префикса сессии испытаний.
 */

const log = (m: string) => process.stdout.write(`${m}\n`);

async function run(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      prefix: { type: 'string' },
      as: { type: 'string', default: 'admin' },
      yes: { type: 'boolean', default: false },
    },
  });
  const prefix = values.prefix?.trim().toLowerCase() ?? '';
  if (prefix.length < 2) throw new Error('--prefix: не короче 2 символов (логины участников испытания)');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const admin = await app.get<UserRepository>(USER_REPOSITORY).findByLogin(values.as);
    if (admin?.role !== 'admin' || admin.disabled)
      throw new Error(`--as ${values.as}: нужен действующий администратор`);

    const query = app.get(AdminQuery);
    const found = [];
    for (let offset = 0; ; offset += 200) {
      const page = await query.users({ q: prefix, role: 'subject', status: null, limit: 200, offset });
      found.push(...page.items.filter((u) => u.login.toLowerCase().startsWith(prefix)));
      if (offset + page.items.length >= page.total || page.items.length === 0) break;
    }
    if (!found.length) {
      log(`Участников с логином «${prefix}…» нет.`);
      return;
    }
    log(`Участников с логином «${prefix}…»: ${found.length}`);
    for (const u of found)
      log(
        `  ${u.login.padEnd(24)} лицо: ${u.face ? 'да' : 'нет'}  passkey: ${u.passkeys}  согласие: ${u.consent ? 'да' : 'нет'}`,
      );
    if (!values.yes) {
      log(
        '\nПробный запуск: ничего не удалено. Добавьте --yes, чтобы отозвать согласия и удалить биометрию.',
      );
      return;
    }
    const consent = app.get(ConsentService);
    let faces = 0;
    let revoked = 0;
    for (const u of found) {
      const r = await consent.revoke(u.id);
      if (r.revoked) revoked++;
      if (r.face) faces++;
    }
    await app.get<AuditLog>(AUDIT_LOG).record({
      actorId: admin.id,
      action: 'protocol.cleanup',
      details: { prefix, participants: found.length, consentsRevoked: revoked, facesDeleted: faces },
    });
    log(
      `\nГотово: согласий отозвано ${revoked}, шаблонов лица удалено ${faces}. Запись в аудите: protocol.cleanup.`,
    );
  } finally {
    await app.close();
  }
}

run().then(
  () => process.exit(0),
  (err: unknown) => {
    console.error(JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) }));
    process.exit(1);
  },
);
