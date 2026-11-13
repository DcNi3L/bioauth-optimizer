import type { ReactNode } from 'react';

export function EmptyState({
  icon,
  title,
  children,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {icon && <span className="mb-1 rounded-full bg-paper p-3 text-graphite [&>svg]:size-6">{icon}</span>}
      <p className="font-medium">{title}</p>
      {children && <div className="max-w-sm text-sm text-graphite">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-md bg-rule/70 ${className}`} />;
}
