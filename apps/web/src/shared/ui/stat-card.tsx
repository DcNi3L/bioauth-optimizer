import type { ReactNode } from 'react';

/** Показатель на сводке: подпись, крупное число и пояснение. */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'ink',
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
  tone?: 'ink' | 'far' | 'frr' | 'optimum' | 'caution';
}) {
  const accent = {
    ink: 'text-ink bg-paper',
    far: 'text-far bg-far-bg',
    frr: 'text-frr bg-frr-bg',
    optimum: 'text-optimum bg-optimum-bg',
    caution: 'text-caution bg-caution-bg',
  }[tone];
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-rule bg-sheet p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-graphite">{label}</span>
        {icon && (
          <span className={`flex size-8 items-center justify-center rounded-lg [&>svg]:size-4 ${accent}`}>
            {icon}
          </span>
        )}
      </div>
      <span className="num font-serif text-3xl leading-none font-semibold">{value}</span>
      {sub && <span className="text-xs text-graphite">{sub}</span>}
    </div>
  );
}
