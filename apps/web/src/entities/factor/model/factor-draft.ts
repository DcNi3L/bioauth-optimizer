import type { FactorDto } from '@bioauth/contracts';
import { numberToInput, parseNumber } from '@/shared/lib';

/** Строка редактируемой таблицы факторов: числа хранятся как введённый текст. */
export interface FactorDraft {
  readonly key: string;
  code: string;
  name: string;
  far: string;
  frr: string;
  latencyMs: string;
  cost: string;
  hasPad: boolean;
}

let seq = 0;
const nextKey = () => `f${++seq}`;

export function draftFromDto(f: FactorDto): FactorDraft {
  return {
    key: nextKey(),
    code: f.code,
    name: f.name,
    far: numberToInput(f.far),
    frr: numberToInput(f.frr),
    latencyMs: numberToInput(f.latencyMs),
    cost: numberToInput(f.cost),
    hasPad: f.hasPad,
  };
}

export function emptyDraft(index: number): FactorDraft {
  return { key: nextKey(), code: `F${index + 1}`, name: '', far: '', frr: '', latencyMs: '0', cost: '0', hasPad: false };
}

/** Перевод в DTO; нераспознанные числа становятся NaN — их отклонит zod-схема с понятным сообщением. */
export function draftToDto(d: FactorDraft): FactorDto {
  const num = (s: string) => parseNumber(s) ?? Number.NaN;
  return {
    code: d.code.trim(),
    name: d.name.trim() || d.code.trim(),
    far: num(d.far),
    frr: num(d.frr),
    latencyMs: num(d.latencyMs),
    cost: num(d.cost),
    hasPad: d.hasPad,
  };
}
