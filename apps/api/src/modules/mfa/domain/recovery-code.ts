import { randomInt } from 'node:crypto';

/** Алфавит без похожих символов (0/O, 1/I/L): код диктуют и переписывают от руки. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const GROUP = 5;
export const RECOVERY_CODES = 10;

/** Код вида `K7M2P-9XQ4T`: 10 символов по 31 варианту ≈ 49,5 бит. */
export function generateRecoveryCode(): string {
  const pick = () => ALPHABET[randomInt(ALPHABET.length)]!;
  const part = () => Array.from({ length: GROUP }, pick).join('');
  return `${part()}-${part()}`;
}

/** Ввод пользователя в каноническую форму: регистр, пробелы и дефис не важны. */
export const normalizeRecoveryCode = (input: string): string => input.toUpperCase().replace(/[^A-Z0-9]/g, '');
