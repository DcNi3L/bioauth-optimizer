import { z } from 'zod';

/** v3.3: динамика набора текста — поведенческая биометрия (ритм нажатия клавиш). */

/** Фраза по умолчанию; фактическую фразу сервер отдаёт в статусе. Только строчные латинские буквы и пробелы. */
export const KEYSTROKE_PHRASE = 'the quick brown fox';
export const KEYSTROKE_ENROLL_SAMPLES = 5;

/** Одно нажатие: физическая клавиша (KeyboardEvent.code — не зависит от раскладки) и моменты нажатия/отпускания, мс. */
export const keyEventSchema = z.strictObject({
  code: z.string().min(1).max(24),
  down: z.number().min(0).max(600_000),
  up: z.number().min(0).max(600_000),
});
export type KeyEvent = z.infer<typeof keyEventSchema>;

export const keystrokeSampleSchema = z.strictObject({
  events: z.array(keyEventSchema).min(8).max(64),
});
export type KeystrokeSample = z.infer<typeof keystrokeSampleSchema>;

export const enrollKeystrokeSchema = z.strictObject({
  samples: z.array(keystrokeSampleSchema).min(KEYSTROKE_ENROLL_SAMPLES).max(10),
});

export const keystrokeStatusSchema = z.object({
  enrolled: z.boolean(),
  samples: z.number().int(),
  updatedAt: z.string().nullable(),
  phrase: z.string(),
  /** Минимальное число повторов при регистрации. */
  required: z.number().int(),
});
export type KeystrokeStatusDto = z.infer<typeof keystrokeStatusSchema>;

export const keystrokeEnrolledSchema = z.object({
  enrolled: z.literal(true),
  samples: z.number().int(),
  /** Разброс повторов относительно шаблона: чем меньше, тем стабильнее почерк. */
  consistency: z.number(),
});

export const keystrokeVerifyResultSchema = z.object({
  accepted: z.boolean(),
  /** Среднее нормированное отклонение признаков от шаблона (меньше — ближе к шаблону). */
  distance: z.number(),
  threshold: z.number(),
  /** Сходство 0…1 для отображения: 1 − distance / 4. */
  score: z.number(),
});
export type KeystrokeVerifyResultDto = z.infer<typeof keystrokeVerifyResultSchema>;
