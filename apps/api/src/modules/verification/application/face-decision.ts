import type {
  AuthRejectReason,
  BioLivenessResponse,
  BioVerifyResponse,
  FaceStep,
  LivenessCommand,
} from '@bioauth/contracts';

export interface FaceDecision {
  readonly accepted: boolean;
  /** Первая по важности причина отказа; null — принято. */
  readonly reason: AuthRejectReason | null;
  readonly score: number;
  readonly pLive: number;
  readonly challengesOk: boolean;
}

/**
 * Решение по лицу (docs/10 §10.5.4) — правило «И» из статьи СРО1 внутри одного фактора:
 * accept = (s ≥ τ_face) ∧ (median p_live ≥ τ_pad) ∧ (все команды выполнены) ∧ (согласованность личности).
 * Причина отказа выбирается по важности для безопасности: подмена лица → команды → пассивная PAD → сходство.
 */
export function decideFace(
  step: FaceStep,
  issued: readonly LivenessCommand[],
  liveness: BioLivenessResponse,
  verify: BioVerifyResponse,
): FaceDecision {
  const performed = new Map(liveness.commands.map((c) => [c.command, c.passed]));
  const challengesOk = issued.every((c) => performed.get(c) === true);
  const checks: [boolean, AuthRejectReason][] = [
    [liveness.identityConsistent, 'IDENTITY_SWITCH'],
    [challengesOk, 'LIVENESS_COMMANDS'],
    [liveness.pLiveMedian >= step.tauPad, 'LIVENESS_PASSIVE'],
    [verify.score >= step.tauFace, 'NO_MATCH'],
  ];
  const failed = checks.find(([ok]) => !ok);
  return {
    accepted: failed === undefined,
    reason: failed?.[1] ?? null,
    score: verify.score,
    pLive: liveness.pLiveMedian,
    challengesOk,
  };
}

export const REASON_MESSAGES: Record<AuthRejectReason, string> = {
  FACE_QUALITY: 'Лицо плохо видно: проверьте освещение и смотрите в камеру',
  NO_MATCH: 'Лицо не совпало с зарегистрированным',
  LIVENESS_PASSIVE: 'Проверка «живости» не пройдена: нужен живой человек, а не фото или экран',
  LIVENESS_COMMANDS: 'Команды выполнены не полностью — повторите движения головой',
  IDENTITY_SWITCH: 'Во время проверки в кадре сменился человек',
  PASSKEY_FAILED: 'Passkey не подтверждён на устройстве',
  TOTP_FAILED: 'Код из приложения не подошёл',
  KEYSTROKE_NO_MATCH: 'Ритм набора не совпал с зарегистрированным — наберите фразу как обычно',
  KEYSTROKE_INPUT: 'Фраза набрана неточно — наберите её заново без исправлений',
  NOT_ENROLLED: 'Этот способ входа не настроен',
  SESSION_EXPIRED: 'Время сессии входа истекло — начните заново',
  LOCKED: 'Слишком много неудачных попыток — вход временно заблокирован',
};
