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
      {icon && <span className="text-graphite bg-paper mb-1 rounded-full p-3 [&>svg]:size-6">{icon}</span>}
      <p className="font-medium">{title}</p>
      {children && <div className="text-graphite max-w-sm text-sm">{children}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <span aria-hidden className={`bg-rule/70 block animate-pulse rounded-md ${className}`} />;
}
