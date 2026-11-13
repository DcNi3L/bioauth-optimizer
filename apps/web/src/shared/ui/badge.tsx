import type { ReactNode } from 'react';

export type BadgeTone = 'neutral' | 'far' | 'frr' | 'optimum' | 'caution' | 'ink';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-paper text-graphite ring-rule',
  far: 'bg-far-bg text-far-ink ring-far/25',
  frr: 'bg-frr-bg text-frr-ink ring-frr/25',
  optimum: 'bg-optimum-bg text-optimum-ink ring-optimum/25',
  caution: 'bg-caution-bg text-caution ring-caution/25',
  ink: 'bg-ink text-sheet ring-ink',
};

export function Badge({
  tone = 'neutral',
  children,
  dot = false,
  className = '',
}: {
  tone?: BadgeTone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${tones[tone]} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
