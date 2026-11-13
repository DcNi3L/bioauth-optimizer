import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'subtle';
type Size = 'sm' | 'md';

const styles: Record<Variant, string> = {
  primary: 'bg-ink text-sheet hover:bg-ink-hover shadow-sm',
  secondary: 'bg-sheet text-ink border border-rule hover:border-graphite hover:bg-hover',
  ghost: 'text-frr hover:underline underline-offset-4 px-1',
  danger: 'bg-sheet text-far border border-far/40 hover:bg-far-bg',
  subtle: 'text-graphite hover:text-ink hover:bg-hover',
};
const sizes: Record<Size, string> = { sm: 'h-8 px-3 text-[13px]', md: 'h-10 px-4 text-sm' };

export function Button({
  variant = 'primary',
  className = '',
  busy = false,
  children,
  size = 'md',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; size?: Size }) {
  const props = rest;
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      data-variant={variant}
      className={`inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
        variant === 'ghost' ? '' : sizes[size]
      } ${styles[variant]} ${className}`}
    >
      {busy && (
        <span
          className="size-3.5 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      )}
      {children}
    </button>
  );
}
