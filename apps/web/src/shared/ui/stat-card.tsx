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
    <div className="border-rule bg-sheet flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-graphite text-sm">{label}</span>
        {icon && (
          <span className={`flex size-8 items-center justify-center rounded-lg [&>svg]:size-4 ${accent}`}>
            {icon}
          </span>
        )}
      </div>
      <span className="num font-serif text-3xl font-semibold leading-none">{value}</span>
      {sub && <span className="text-graphite text-xs">{sub}</span>}
    </div>
  );
}
