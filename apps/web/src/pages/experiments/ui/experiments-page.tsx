import { Panel } from '@/shared/ui';
import { ExperimentsTable } from '@/widgets/experiments-table';

export function ExperimentsPage() {
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-2xl">История экспериментов</h1>
        <p className="text-graphite mt-1 max-w-prose text-sm">
          Каждый расчёт сохраняется вместе с входными данными, результатом и версией вычислительного ядра.
        </p>
      </div>
      <Panel>
        <ExperimentsTable />
      </Panel>
    </div>
  );
}
