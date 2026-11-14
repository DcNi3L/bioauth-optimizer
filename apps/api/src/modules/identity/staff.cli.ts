import { parseArgs } from 'node:util';

import { loginSchema, roleSchema } from '@bioauth/contracts';

import { loadConfig } from '../../shared/config/env';
import { createDb } from '../../shared/database/kysely';
import { KyselyAuditLog } from '../audit/infrastructure/kysely-audit-log';
import { KyselyUserRepository } from './infrastructure/kysely-identity.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';

/**
 * Учётная запись сотрудника (второй администратор для принципа четырёх глаз, исследователь, аудитор):
 *
 *   STAFF_PASSWORD='…' pnpm --filter @bioauth/api staff -- --login anna --role researcher --name "Анна К."
 *   STAFF_PASSWORD='…' pnpm --filter @bioauth/api staff -- --login admin --reset-password
 *
 *   pnpm --filter @bioauth/api staff -- --login admin --reset-mfa
 *
 * --reset-mfa — аварийное восстановление, когда сотрудник потерял passkey и приложение-аутентификатор: удаляются
 * его passkey, TOTP и коды восстановления, сеансы завершаются, событие пишется в аудит. Затем вход по паролю и
 * регистрация нового passkey. Доступно только тому, у кого есть доступ к серверу (консоль, контейнер).
 * --reset-password меняет пароль существующего сотрудника и завершает его сеансы (make secrets так меняет пароль
 * первого администратора на сгенерированный); без STAFF_PASSWORD берётся ADMIN_PASSWORD из окружения.
 *
 * Пароль передаётся через переменную окружения, а не аргумент — так он не попадает в историю команд и список процессов.
 */
async function run(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: {
      login: { type: 'string' },
      role: { type: 'string' },
      name: { type: 'string' },
      'reset-password': { type: 'boolean', default: false },
      'reset-mfa': { type: 'boolean', default: false },
    },
  });
  if (values['reset-password']) return resetPassword(values.login);
  if (values['reset-mfa']) return resetMfa(values.login);
  const login = loginSchema.safeParse(values.login);
  if (!login.success) throw new Error('--login: 3–64 символа, латинские буквы, цифры, «.», «-», «_»');
  const role = roleSchema.exclude(['subject']).safeParse(values.role);
  if (!role.success) throw new Error('--role: admin, researcher или auditor');
  const displayName = (values.name ?? login.data).trim().slice(0, 200);
  const password = process.env.STAFF_PASSWORD ?? '';
  if (password.length < 12) throw new Error('STAFF_PASSWORD: пароль не короче 12 символов');

  const config = loadConfig();
  const db = createDb(config.DATABASE_URL, 2);
  try {
    const created = await new KyselyUserRepository(db).create({
      login: login.data,
      displayName,
      role: role.data,
      passwordHash: await new ScryptPasswordHasher().hash(password),
    });
    if (!created) throw new Error(`логин «${login.data}» уже занят`);
    process.stdout.write(
      `${JSON.stringify({ level: 'info', msg: 'создан сотрудник', login: login.data, role: role.data })}\n`,
    );
  } finally {
    await db.destroy();
  }
}

async function resetMfa(login: string | undefined): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL, 2);
  try {
    const user = await db
      .selectFrom('app_user')
      .select(['id', 'role'])
      .where('login', '=', login ?? '')
      .executeTakeFirst();
    if (!user || user.role === 'subject') throw new Error(`сотрудник «${login ?? ''}» не найден`);
    const removed = await db.transaction().execute(async (trx) => {
      const passkeys = await trx
        .deleteFrom('webauthn_credential')
        .where('user_id', '=', user.id)
        .executeTakeFirst();
      const totp = await trx.deleteFrom('user_totp').where('user_id', '=', user.id).executeTakeFirst();
      const codes = await trx
        .deleteFrom('user_recovery_code')
        .where('user_id', '=', user.id)
        .executeTakeFirst();
      await trx.deleteFrom('user_session').where('user_id', '=', user.id).execute();
      return {
        passkeys: Number(passkeys.numDeletedRows),
        totp: Number(totp.numDeletedRows) > 0,
        recoveryCodes: Number(codes.numDeletedRows),
      };
    });
    await new KyselyAuditLog(db).record({
      actorId: user.id,
      action: 'staff.mfa_reset',
      target: user.id,
      details: { ...removed, via: 'cli' },
    });
    process.stdout.write(
      `${JSON.stringify({ level: 'info', msg: 'второй фактор сброшен: войдите паролем и зарегистрируйте passkey', login, ...removed })}\n`,
    );
  } finally {
    await db.destroy();
  }
}

async function resetPassword(login: string | undefined): Promise<void> {
  const password = process.env.STAFF_PASSWORD ?? process.env.ADMIN_PASSWORD ?? '';
  if (password.length < 12)
    throw new Error('STAFF_PASSWORD (или ADMIN_PASSWORD): пароль не короче 12 символов');
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL, 2);
  try {
    const user = await db
      .updateTable('app_user')
      .set({ password_hash: await new ScryptPasswordHasher().hash(password) })
      .where('login', '=', login ?? '')
      .where('role', '!=', 'subject')
      .returning('id')
      .executeTakeFirst();
    if (!user) throw new Error(`сотрудник «${login ?? ''}» не найден`);
    // Старый пароль мог утечь — открытые сеансы завершаются.
    await db.deleteFrom('user_session').where('user_id', '=', user.id).execute();
    process.stdout.write(`${JSON.stringify({ level: 'info', msg: 'пароль сотрудника изменён', login })}\n`);
  } finally {
    await db.destroy();
  }
}

run().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
