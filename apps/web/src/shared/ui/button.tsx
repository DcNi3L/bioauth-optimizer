import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-sheet hover:bg-[#2a3644] disabled:bg-graphite',
  secondary: 'bg-sheet text-ink border border-rule hover:border-graphite',
  ghost: 'text-frr hover:underline underline-offset-4 px-1',
};

export function Button({
  variant = 'primary',
  className = '',
  busy = false,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-70 ${
        variant === 'ghost' ? '' : 'h-10 px-4'
      } ${styles[variant]} ${className}`}
    >
      {busy && <span className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}
