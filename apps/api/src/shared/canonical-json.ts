import { createHash } from 'node:crypto';

/** JSON с отсортированными ключами — одинаковый вход даёт одинаковую строку и хэш. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

export const sha256Hex = (data: string | Buffer): string => createHash('sha256').update(data).digest('hex');
