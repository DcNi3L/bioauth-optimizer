import { assertDomain, isFiniteNumber } from '../errors';
import type { Costs, NormalParams } from './types';

export function validateCosts(costs: Costs): void {
  assertDomain(
    isFiniteNumber(costs.cFA) && costs.cFA > 0,
    'cFA должно быть положительным числом',
    'costs.cFA',
  );
  assertDomain(
    isFiniteNumber(costs.cFR) && costs.cFR > 0,
    'cFR должно быть положительным числом',
    'costs.cFR',
  );
}

export function validateFarMax(farMax: number | null | undefined, path = 'farMax'): void {
  if (farMax === null || farMax === undefined) return;
  assertDomain(isFiniteNumber(farMax) && farMax > 0 && farMax < 1, 'FAR_max должно лежать в (0, 1)', path);
}

export function validateNormal(p: NormalParams, path: string): void {
  assertDomain(isFiniteNumber(p.mean), 'среднее должно быть конечным числом', `${path}.mean`);
  assertDomain(isFiniteNumber(p.std) && p.std > 0, 'стандартное отклонение должно быть > 0', `${path}.std`);
}
