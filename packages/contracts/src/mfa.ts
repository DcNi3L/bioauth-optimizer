import { z } from 'zod';

/** v3.3: второй фактор без лица и passkey — приложение-аутентификатор (TOTP) и коды восстановления. */

export const totpCodeSchema = z.string().regex(/^\d{6}$/, { error: 'код — 6 цифр' });

/** Код восстановления вида `K7M2P-9XQ4T`; регистр, пробелы и дефис не важны. */
export const recoveryCodeSchema = z
  .string()
  .trim()
  .min(10, { error: 'код восстановления слишком короткий' })
  .max(16, { error: 'код восстановления слишком длинный' });

export const totpCodeRequestSchema = z.strictObject({ code: totpCodeSchema });
export const recoveryCodeRequestSchema = z.strictObject({ code: recoveryCodeSchema });

export const mfaStatusSchema = z.object({
  totp: z.object({ enabled: z.boolean(), confirmedAt: z.string().nullable() }),
  recoveryCodesLeft: z.number().int(),
});
export type MfaStatusDto = z.infer<typeof mfaStatusSchema>;

export const totpSetupSchema = z.object({
  /** Секрет в base32 для ручного ввода. Показывается, пока фактор не подтверждён. */
  secret: z.string(),
  /** otpauth://-ссылка: из неё строится QR-код. */
  otpauthUri: z.string(),
});
export type TotpSetupDto = z.infer<typeof totpSetupSchema>;

export const totpEnabledSchema = z.object({
  enabled: z.literal(true),
  /** Новый набор кодов восстановления: показывается один раз. */
  recoveryCodes: z.array(z.string()),
});

export const recoveryCodesSchema = z.object({ recoveryCodes: z.array(z.string()) });
export const mfaCompleteSchema = z.object({
  mfaComplete: z.literal(true),
  /** Сколько кодов восстановления осталось (для входа по коду восстановления). */
  recoveryCodesLeft: z.number().int().optional(),
});
