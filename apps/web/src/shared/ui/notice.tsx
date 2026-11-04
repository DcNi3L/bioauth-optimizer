import type { ReactNode } from 'react';

type Tone = 'error' | 'caution' | 'info' | 'success';

const tones: Record<Tone, string> = {
  error: 'border-far/40 bg-[#fbecee] text-[#7d1a2b]',
  caution: 'border-caution/30 bg-caution-bg text-caution',
  info: 'border-frr/30 bg-[#e8f0f6] text-[#16486b]',
  success: 'border-optimum/30 bg-[#e7f3ec] text-[#1f5a38]',
};

export function Notice({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${tones[tone]}`}>
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={title ? 'mt-1' : ''}>{children}</div>}
    </div>
  );
}
