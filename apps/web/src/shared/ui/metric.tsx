import type { ReactNode } from 'react';

/** Подписанное значение: подпись сверху мелко, число крупно моноширинными цифрами. */
export function Metric({ label, value, tone }: { label: ReactNode; value: ReactNode; tone?: 'far' | 'frr' | 'optimum' }) {
  const color = tone === 'far' ? 'text-far' : tone === 'frr' ? 'text-frr' : tone === 'optimum' ? 'text-optimum' : 'text-ink';
  return (
    <div className="flex flex-col">
      <span className="text-xs text-graphite">{label}</span>
      <span className={`num text-[15px] font-medium ${color}`}>{value}</span>
    </div>
  );
}
