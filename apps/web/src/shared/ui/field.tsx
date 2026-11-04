import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, useId } from 'react';

interface FieldShellProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

function FieldShell({ label, hint, error, children, className = '' }: FieldShellProps) {
  const id = useId();
  const hintId = hint || error ? `${id}-hint` : undefined;
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      <label htmlFor={id} className="text-graphite text-sm">
        {label}
      </label>
      {children(id, hintId)}
      {error ? (
        <p id={hintId} className="text-far text-xs">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-graphite text-xs">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

const inputClass = (error?: string) =>
  `num h-10 rounded-md border bg-sheet px-3 text-[15px] text-ink outline-none transition-colors focus:border-frr ${
    error ? 'border-far' : 'border-rule'
  }`;

export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          aria-describedby={describedBy}
          aria-invalid={!!error || undefined}
          className={inputClass(error)}
          {...props}
        />
      )}
    </FieldShell>
  );
}

/** Поле для числа: десятичная запятая и запись вида 1e-6 допускаются (разбирает parseNumber). */
export function NumberField(
  props: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'type'> & {
    label: ReactNode;
    hint?: ReactNode;
    error?: string;
  },
) {
  return <TextField inputMode="decimal" autoComplete="off" spellCheck={false} {...props} />;
}

export function SelectField({
  label,
  hint,
  error,
  className,
  children,
  ...props
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={className}>
      {(id, describedBy) => (
        <select id={id} aria-describedby={describedBy} className={`${inputClass(error)} pr-8`} {...props}>
          {children}
        </select>
      )}
    </FieldShell>
  );
}
