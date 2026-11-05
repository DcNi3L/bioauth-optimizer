import type { FaceIssue } from '@bioauth/contracts';

import type { TFn } from '@/shared/i18n';

const ISSUES: readonly FaceIssue[] = [
  'NO_FACE',
  'MANY_FACES',
  'LOW_CONFIDENCE',
  'TOO_SMALL',
  'BLURRY',
  'TOO_DARK',
  'TOO_BRIGHT',
  'POSE',
];

/** Уникальные подсказки по списку кадров — для сообщения после неудачной съёмки. */
export function issueHints(frames: readonly { issues: readonly string[] }[], t: TFn): string[] {
  const seen = new Set<string>();
  for (const f of frames)
    for (const i of f.issues)
      if ((ISSUES as readonly string[]).includes(i)) seen.add(t(`face.issue.${i as FaceIssue}`));
  return [...seen];
}
