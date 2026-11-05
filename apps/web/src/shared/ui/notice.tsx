import type { ReactNode } from 'react';

type Tone = 'error' | 'caution' | 'info' | 'success';

const tones: Record<Tone, string> = {
  error: 'border-far/40 bg-far-bg text-far-ink',
  caution: 'border-caution/30 bg-caution-bg text-caution',
  info: 'border-frr/30 bg-frr-bg text-frr-ink',
  success: 'border-optimum/30 bg-optimum-bg text-optimum-ink',
};

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}
