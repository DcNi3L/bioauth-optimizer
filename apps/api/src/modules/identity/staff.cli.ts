import { parseArgs } from 'node:util';

import { loginSchema, roleSchema } from '@bioauth/contracts';

import { loadConfig } from '../../shared/config/env';
import { createDb } from '../../shared/database/kysely';
import { KyselyUserRepository } from './infrastructure/kysely-identity.repository';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';

/**
 * Учётная запись сотрудника (второй администратор для принципа четырёх глаз, исследователь, аудитор):
 *
 *   STAFF_PASSWORD='…' pnpm --filter @bioauth/api staff -- --login anna --role researcher --name "Анна К."
 *
 * Пароль передаётся через переменную окружения, а не аргумент — так он не попадает в историю команд и список процессов.
 */
async function run(): Promise<void> {
  const { values } = parseArgs({
    options: { login: { type: 'string' }, role: { type: 'string' }, name: { type: 'string' } },
  });
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

run().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
