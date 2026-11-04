import { assertDomain, isFiniteNumber } from '../errors';
import { validateCosts, validateFarMax } from '../threshold/validation';
import type { FactorSelectionProblem } from './types';

export const MAX_FACTORS = 50;

export function validateProblem(problem: FactorSelectionProblem): void {
  const { factors, constraints } = problem;
  // Защита от нетипизированных вызовов (JSON извне): проверяем форму, не теряя тип readonly Factor[].
  assertDomain(Array.isArray(problem.factors) && factors.length >= 1, 'нужен хотя бы один фактор', 'factors');
  assertDomain(factors.length <= MAX_FACTORS, `факторов не может быть больше ${MAX_FACTORS}`, 'factors');
  const codes = new Set<string>();
  factors.forEach((f, i) => {
    const p = `factors[${i}]`;
    assertDomain(
      typeof (f.code as unknown) === 'string' && f.code.trim().length > 0,
      'код фактора не может быть пустым',
      `${p}.code`,
    );
    assertDomain(!codes.has(f.code), `код фактора «${f.code}» повторяется`, `${p}.code`);
    codes.add(f.code);
    assertDomain(
      isFiniteNumber(f.far) && f.far > 0 && f.far < 1,
      'FAR фактора должен лежать в (0, 1)',
      `${p}.far`,
    );
    assertDomain(
      isFiniteNumber(f.frr) && f.frr >= 0 && f.frr < 1,
      'FRR фактора должен лежать в [0, 1)',
      `${p}.frr`,
    );
    assertDomain(
      isFiniteNumber(f.latencyMs) && f.latencyMs >= 0,
      'задержка должна быть ≥ 0',
      `${p}.latencyMs`,
    );
    assertDomain(isFiniteNumber(f.cost) && f.cost >= 0, 'стоимость должна быть ≥ 0', `${p}.cost`);
  });
  validateCosts(problem.costs);
  const nonNeg = (v: number | null, path: string) =>
    assertDomain(v === null || (isFiniteNumber(v) && v >= 0), 'ограничение должно быть числом ≥ 0', path);
  nonNeg(constraints.latencyMaxMs, 'constraints.latencyMaxMs');
  nonNeg(constraints.budget, 'constraints.budget');
  validateFarMax(constraints.farMax, 'constraints.farMax');
  assertDomain(
    Number.isInteger(constraints.minPadFactors) && constraints.minPadFactors >= 0,
    'минимальное число факторов с PAD должно быть целым ≥ 0',
    'constraints.minPadFactors',
  );
  assertDomain(
    [undefined, 'AND'].includes(problem.fusionRule),
    'поддерживается только правило объединения «И»',
    'fusionRule',
  );
}
