import type { InputHTMLAttributes, ReactNode } from 'react';

export function Checkbox({
  label,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" className="accent-ink size-4" {...props} />
      {label}
    </label>
  );
}
