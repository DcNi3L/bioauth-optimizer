export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  fill = false,
}: {
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
  /** Во всю ширину, кнопки поровну (карточка входа). */
  fill?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`${fill ? 'flex w-full' : 'inline-flex max-w-full flex-wrap'} rounded-md border border-rule bg-paper p-0.5`}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded py-1.5 text-sm whitespace-nowrap transition-colors ${fill ? 'min-w-0 flex-1 px-1.5 max-sm:text-[13px]' : 'px-3'} ${
            value === o.value
              ? 'bg-sheet text-ink shadow-[0_0_0_1px_var(--color-rule)]'
              : 'text-graphite hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
