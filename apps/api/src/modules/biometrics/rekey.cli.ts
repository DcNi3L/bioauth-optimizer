import { loadConfig } from '../../shared/config/env';
import { keystrokeSecretStore, rekeySecrets, totpSecretStore } from '../../shared/crypto/rekey-secrets';
import { AesGcmSecretBox } from '../../shared/crypto/secret-box';
import { createDb } from '../../shared/database/kysely';
import { rekeyTemplates } from './application/rekey';
import { AesGcmTemplateCipher } from './infrastructure/aes-gcm-template-cipher';
import { KyselyFaceTemplateRepository } from './infrastructure/kysely-biometrics.repository';

/** pnpm --filter @bioauth/api rekey — перешифровать шаблоны лица, секреты TOTP и шаблоны ритма набора активным ключом. */
async function run(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL, 2);
  try {
    const r = await rekeyTemplates(new KyselyFaceTemplateRepository(db), new AesGcmTemplateCipher(config));
    const secrets = await rekeySecrets(
      [totpSecretStore(db), keystrokeSecretStore(db)],
      new AesGcmSecretBox(config),
    );
    process.stdout.write(
      `${JSON.stringify({ level: 'info', msg: 'ротация ключа шаблонов', activeKey: config.TEMPLATE_ACTIVE_KEY, ...r, secrets })}\n`,
    );
  } finally {
    await db.destroy();
  }
}

run().catch((err: unknown) => {
  console.error(JSON.stringify({ level: 'fatal', msg: err instanceof Error ? err.message : String(err) }));
  process.exit(1);
});
