/** Знак BioAuth: контур головы с точкой оптимума на кривой стоимости. */
export function Logo({ className = 'size-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" className="fill-ink" />
      <path
        d="M16 7.5c-4 0-6.6 3-6.6 7 0 2.7 1.2 4.9 2.9 6.2v2.3c0 .9.7 1.5 1.5 1.5h4.4c.8 0 1.5-.6 1.5-1.5v-2.3c1.7-1.3 2.9-3.5 2.9-6.2 0-4-2.6-7-6.6-7Z"
        fill="none"
        strokeWidth="1.6"
        className="stroke-sheet"
      />
      <path
        d="M11.5 15.8c1.6 2.4 3 3.2 4.5 3.2s2.9-.8 4.5-3.2"
        fill="none"
        strokeWidth="1.6"
        className="stroke-optimum"
        strokeLinecap="round"
      />
      <circle cx="16" cy="19" r="1.6" className="fill-optimum" />
    </svg>
  );
}
