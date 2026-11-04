export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-rule bg-paper p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded px-3 py-1.5 text-sm transition-colors ${
            value === o.value ? 'bg-sheet text-ink shadow-[0_0_0_1px_var(--color-rule)]' : 'text-graphite hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
