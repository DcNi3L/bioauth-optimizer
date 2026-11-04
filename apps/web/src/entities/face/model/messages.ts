import type { AuthRejectReason, FaceIssue, LivenessCommand } from '@bioauth/contracts';

/** Подсказки по проблемам качества кадра (docs/10 §10.5.2). */
export const ISSUE_MESSAGES: Record<FaceIssue, string> = {
  NO_FACE: 'Лицо не найдено — встаньте напротив камеры',
  MANY_FACES: 'В кадре должно быть одно лицо',
  LOW_CONFIDENCE: 'Лицо видно нечётко',
  TOO_SMALL: 'Подойдите ближе к камере',
  BLURRY: 'Изображение размыто — не двигайтесь при съёмке',
  TOO_DARK: 'Слишком темно — добавьте света',
  TOO_BRIGHT: 'Слишком светло — уберите яркий свет за спиной или на лице',
  POSE: 'Смотрите прямо в камеру',
};

/** Изображение не зеркальное, но пользователь видит зеркальный предпросмотр: «влево» — для самого человека. */
export const COMMAND_TEXT: Record<LivenessCommand, string> = {
  TURN_LEFT: 'Поверните голову влево',
  TURN_RIGHT: 'Поверните голову вправо',
  CHIN_UP: 'Поднимите подбородок',
  MOVE_CLOSER: 'Приблизьтесь к камере',
};

export const COMMAND_ICON: Record<LivenessCommand, string> = {
  TURN_LEFT: '←',
  TURN_RIGHT: '→',
  CHIN_UP: '↑',
  MOVE_CLOSER: '⤢',
};

export const REASON_TITLES: Record<AuthRejectReason, string> = {
  FACE_QUALITY: 'Лицо плохо видно',
  NO_MATCH: 'Лицо не совпало',
  LIVENESS_PASSIVE: 'Проверка «живости» не пройдена',
  LIVENESS_COMMANDS: 'Команды не выполнены',
  IDENTITY_SWITCH: 'В кадре сменился человек',
  PASSKEY_FAILED: 'Passkey не подтверждён',
  SESSION_EXPIRED: 'Время истекло',
  LOCKED: 'Вход заблокирован',
};

/** Уникальные подсказки по списку кадров — для сообщения после неудачной съёмки. */
export function issueHints(frames: readonly { issues: readonly string[] }[]): string[] {
  const seen = new Set<string>();
  for (const f of frames)
    for (const i of f.issues) if (i in ISSUE_MESSAGES) seen.add(ISSUE_MESSAGES[i as FaceIssue]);
  return [...seen];
}
