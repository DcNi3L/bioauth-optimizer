import loadHighs from 'highs';
import type { MilpModel, MilpPort, MilpSolution } from './milp-port';

type Highs = Awaited<ReturnType<typeof loadHighs>>;

/** Параметры HiGHS: нулевой зазор оптимальности — иначе MILP может вернуть не минимальное S(x). */
const HIGHS_OPTIONS = {
  output_flag: false,
  mip_rel_gap: 0,
  mip_abs_gap: 0,
  mip_feasibility_tolerance: 1e-9,
  primal_feasibility_tolerance: 1e-9,
} as const;

const varName = (i: number) => `x${i}`;

function formatTerms(coeffs: readonly number[]): string {
  const parts: string[] = [];
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const sign = c < 0 ? '-' : '+';
    parts.push(`${parts.length === 0 && sign === '+' ? '' : `${sign} `}${String(Math.abs(c))} ${varName(i)}`);
  });
  return parts.length > 0 ? parts.join(' ') : `0 ${varName(0)}`;
}

/** Модель в формате CPLEX LP. Числа печатаются кратчайшим представлением, однозначно восстанавливающим double. */
export function toCplexLp(model: MilpModel): string {
  const lines = ['Minimize', ` obj: ${formatTerms(model.objective)}`, 'Subject To'];
  for (const c of model.constraints) {
    lines.push(` ${c.name}: ${formatTerms(c.coeffs)} ${c.sense} ${String(c.rhs)}`);
  }
  lines.push('Binaries');
  lines.push(' ' + Array.from({ length: model.numVars }, (_, i) => varName(i)).join(' '));
  lines.push('End');
  return lines.join('\n');
}

/** Адаптер MilpPort на HiGHS (WASM-сборка, пакет `highs`). Экземпляр решателя загружается один раз. */
export class HighsMilpAdapter implements MilpPort {
  private static instance: Promise<Highs> | null = null;

  private static highs(): Promise<Highs> {
    HighsMilpAdapter.instance ??= loadHighs();
    return HighsMilpAdapter.instance;
  }

  async solve(model: MilpModel): Promise<MilpSolution> {
    const highs = await HighsMilpAdapter.highs();
    let result;
    try {
      result = highs.solve(toCplexLp(model), HIGHS_OPTIONS);
    } catch (err) {
      HighsMilpAdapter.instance = null; // после сбоя WASM-модуль перезагружается
      throw err;
    }
    if (result.Status === 'Infeasible') return { status: 'infeasible' };
    if (result.Status !== 'Optimal') throw new Error(`HiGHS завершился со статусом «${result.Status}»`);
    const columns = result.Columns as Record<string, { Primal: number }>;
    const values = Array.from({ length: model.numVars }, (_, i) => columns[varName(i)]?.Primal ?? 0);
    return { status: 'optimal', values, objective: result.ObjectiveValue };
  }
}
