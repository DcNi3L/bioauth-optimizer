import type { FaceTemplateRepository, TemplateCipher } from './ports';

/**
 * Ротация ключа шаблонов (ADR-0014): каждый шаблон, зашифрованный не активным ключом, расшифровывается
 * своим key_id и шифруется активным (с новой проекцией). Изображения не нужны — повторная регистрация не требуется.
 */
export async function rekeyTemplates(
  templates: FaceTemplateRepository,
  cipher: TemplateCipher,
): Promise<{ checked: number; rekeyed: number }> {
  let checked = 0;
  let rekeyed = 0;
  for await (const t of templates.all()) {
    checked++;
    if (t.keyId === cipher.activeKeyId) continue;
    const plain = cipher.decrypt(t.userId, t.modelVersion, t);
    await templates.upsert({ ...t, ...cipher.encrypt(t.userId, t.modelVersion, plain) });
    rekeyed++;
  }
  return { checked, rekeyed };
}
