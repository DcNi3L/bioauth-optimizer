import { z } from 'zod';

const httpUrl = z
  .string()
  .trim()
  .max(500)
  .regex(/^https?:\/\/\S+$/, 'адрес должен начинаться с http:// или https://');

/**
 * Настройки тенанта: брендинг страницы входа (название, цвет, логотип, тексты, ссылки внизу) и параметры
 * входа — открыта ли самостоятельная регистрация и вход с телефона. Аналог Branding и Authentication в Auth0.
 */
export const tenantSettingsSchema = z.object({
  productName: z.string().trim().min(1).max(40),
  accentColor: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^#[0-9a-f]{6}$/, 'цвет в формате #rrggbb')
    .nullable(),
  logoUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^https:\/\/\S+$/, 'логотип — только по https://')
    .nullable(),
  loginTitle: z.string().trim().max(80).nullable(),
  loginSubtitle: z.string().trim().max(200).nullable(),
  supportUrl: z
    .string()
    .trim()
    .max(500)
    .regex(/^(https?:\/\/|mailto:)\S+$/, 'адрес http(s):// или mailto:')
    .nullable(),
  privacyUrl: httpUrl.nullable(),
  termsUrl: httpUrl.nullable(),
  allowSignup: z.boolean(),
  allowCrossDevice: z.boolean(),
});
export type TenantSettings = z.infer<typeof tenantSettingsSchema>;

export const tenantSettingsDtoSchema = tenantSettingsSchema.extend({
  updatedAt: z.string().nullable(),
});
export type TenantSettingsDto = z.infer<typeof tenantSettingsDtoSchema>;

/** Пустая строка в форме означает «не задано». */
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);
const s = tenantSettingsSchema.shape;
const opt = <T extends z.ZodType>(schema: T) => z.preprocess(blankToNull, schema).optional();
export const updateTenantSettingsSchema = z
  .object({
    productName: s.productName.optional(),
    accentColor: opt(s.accentColor),
    logoUrl: opt(s.logoUrl),
    loginTitle: opt(s.loginTitle),
    loginSubtitle: opt(s.loginSubtitle),
    supportUrl: opt(s.supportUrl),
    privacyUrl: opt(s.privacyUrl),
    termsUrl: opt(s.termsUrl),
    allowSignup: s.allowSignup.optional(),
    allowCrossDevice: s.allowCrossDevice.optional(),
  })
  .strict();
export type UpdateTenantSettings = z.output<typeof updateTenantSettingsSchema>;
