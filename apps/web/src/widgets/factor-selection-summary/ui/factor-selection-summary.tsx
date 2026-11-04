import type { FactorSelectionResponse } from '@bioauth/contracts';
import { formatMs, formatNumber, formatPercent, formatSci } from '@/shared/lib';
import { Metric } from '@/shared/ui';

const CONSTRAINT_LABELS: Record<string, string> = {
  latencyMaxMs: 'задержка',
  budget: 'бюджет',
  farMax: 'FAR набора',
  minPadFactors: 'наличие PAD',
};

const REJECT_LABELS: Record<string, string> = {
  latency: 'по задержке',
  budget: 'по бюджету',
  pad: 'без PAD',
  far: 'по FAR',
};

type Result = Pick<FactorSelectionResponse, 'optimum' | 'stats' | 'solver'>;

/** Оптимальный набор факторов, его метрики и как он получен. */
export function FactorSelectionSummary({ result, factorNames }: { result: Result; factorNames: Record<string, string> }) {
  const { optimum, stats, solver } = result;
  if (!optimum) return null;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-graphite">Оптимальный набор, правило «И»</p>
        <p className="mt-1 font-serif text-3xl text-optimum">{optimum.codes.join(' + ')}</p>
        <p className="mt-1 text-sm text-graphite">{optimum.codes.map((c) => factorNames[c] ?? c).join(', ')}</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Metric label="E = cFA·FAR + cFR·FRR" value={formatNumber(optimum.objective, 6)} tone="optimum" />
        <Metric label="FAR набора" value={formatSci(optimum.far, 2)} tone="far" />
        <Metric label="FRR набора" value={formatPercent(optimum.frr, 3)} tone="frr" />
        <Metric label="Задержка" value={formatMs(optimum.latencyMs)} />
        <Metric label="Стоимость" value={formatNumber(optimum.cost, 3)} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-graphite">Активные ограничения</dt>
          <dd>
            {optimum.activeConstraints.length === 0
              ? 'нет — оптимум внутри допустимой области'
              : optimum.activeConstraints.map((c) => CONSTRAINT_LABELS[c] ?? c).join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-graphite">Допустимых наборов</dt>
          <dd className="num">
            {stats.feasibleCount === null
              ? `полный подсчёт не выполнялся (всего ${stats.subsetsTotal.toLocaleString('ru-RU')})`
              : `${stats.feasibleCount.toLocaleString('ru-RU')} из ${stats.subsetsTotal.toLocaleString('ru-RU')}`}
          </dd>
        </div>
        {stats.rejectedBy && (
          <div className="sm:col-span-2">
            <dt className="text-graphite">Отсечено ограничениями (набор может нарушать несколько)</dt>
            <dd className="num">
              {Object.entries(stats.rejectedBy)
                .map(([k, v]) => `${REJECT_LABELS[k] ?? k}: ${v}`)
                .join('; ')}
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-graphite">Метод</dt>
          <dd>
            {solver.used === 'exhaustive'
              ? 'Полный перебор всех подмножеств с точной нелинейной целевой функцией.'
              : `Линеаризованное ЦЛП (HiGHS) с сертификатом: ${solver.certificate?.iterations ?? 0} итерац., нижняя оценка ${formatNumber(
                  solver.certificate?.lowerBound ?? null,
                  6,
                )} ≥ лучшего E — оптимальность ${solver.certificate?.proven ? 'доказана' : 'не доказана (лимит итераций)'}.`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
