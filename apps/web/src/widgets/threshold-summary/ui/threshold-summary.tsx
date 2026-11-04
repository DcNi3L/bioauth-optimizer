import type { ThresholdOptimizeResponse } from '@bioauth/contracts';
import { formatNumber, formatPercent } from '@/shared/lib';
import { Metric, Notice } from '@/shared/ui';

type Result = Pick<ThresholdOptimizeResponse, 'eer' | 'optimal' | 'lossReduction' | 'verification' | 'warnings' | 'method' | 'sampleSizes'>;

function OperatingPointColumn({
  title,
  point,
  emphasis,
}: {
  title: string;
  point: Result['eer'];
  emphasis?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 ${emphasis ? '' : 'text-graphite'}`}>
      <p className="text-sm">{title}</p>
      <p className={`num font-serif ${emphasis ? 'text-4xl text-optimum' : 'text-2xl text-ink'}`}>
        <span className="formula">τ</span> = {point.tau === null ? '—' : formatNumber(point.tau)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="FAR" value={formatPercent(point.far)} tone="far" />
        <Metric label="FRR" value={formatPercent(point.frr)} tone="frr" />
        <Metric label="E(τ)" value={formatNumber(point.cost, 6)} />
      </div>
    </div>
  );
}

/** Сравнение точки равных ошибок и оптимального порога (формула 1 СРО1). */
export function ThresholdSummary({ result }: { result: Result }) {
  const { eer, optimal, lossReduction, verification, warnings } = result;
  const degenerate = optimal.degenerate;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <OperatingPointColumn title="Точка равных ошибок (EER)" point={eer} />
        <div className="hidden h-full w-px bg-rule sm:block" aria-hidden />
        <OperatingPointColumn title="Минимум ожидаемых потерь" point={optimal} emphasis />
      </div>

      {lossReduction !== null && !degenerate && (
        <p className="max-w-prose text-[15px]">
          Переход от EER к оптимальному порогу снижает ожидаемые потери на{' '}
          <strong className="num font-semibold text-optimum">{formatPercent(lossReduction, 1)}</strong>: с{' '}
          <span className="num">{formatNumber(eer.cost, 4)}</span> до <span className="num">{formatNumber(optimal.cost, 4)}</span>.
        </p>
      )}

      {optimal.interval && (
        <p className="text-sm text-graphite">
          На выборке решения одинаковы для любого порога из интервала (
          <span className="num">{optimal.interval[0] === null ? '−∞' : formatNumber(optimal.interval[0], 6)}</span>;{' '}
          <span className="num">{optimal.interval[1] === null ? '+∞' : formatNumber(optimal.interval[1], 6)}</span>]; рекомендован
          его центр.
          {result.sampleSizes &&
            ` Выборки: ${result.sampleSizes.genuine.toLocaleString('ru-RU')} законных, ${result.sampleSizes.impostor.toLocaleString('ru-RU')} злоумышленников.`}
        </p>
      )}
      {optimal.constrainedByFarMax && (
        <Notice tone="info">Оптимум упирается в ограничение FAR ≤ FAR_max: порог поднят до границы допустимой области.</Notice>
      )}
      {warnings.map((w) => (
        <Notice key={w} tone="caution">
          {w}
        </Notice>
      ))}
      <p className="text-xs text-graphite">
        {verification.status === 'ok' &&
          `Аналитическое решение подтверждено численно: расхождение ${formatNumber(verification.absDiff ?? 0, 2)}.`}
        {verification.status === 'exact' && 'Точный перебор всех порогов по выборке.'}
        {verification.status === 'skipped' && 'Оптимум вырожден — численная проверка не требуется.'}
      </p>
    </div>
  );
}
