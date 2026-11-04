import { randomInt } from 'node:crypto';

import type { LivenessCommand } from '@bioauth/contracts';

export const ALL_COMMANDS: readonly LivenessCommand[] = ['TURN_LEFT', 'TURN_RIGHT', 'CHIN_UP', 'MOVE_CLOSER'];

/** Случайный набор различных команд (криптографический ГСЧ): последовательность непредсказуема для записи видео. */
export function randomCommands(count: number, rnd: (max: number) => number = randomInt): LivenessCommand[] {
  const pool = [...ALL_COMMANDS];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rnd(i + 1);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, Math.min(count, pool.length));
}
