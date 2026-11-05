import { Panel } from '@/shared/ui';
import { ExperimentsTable } from '@/widgets/experiments-table';

export function ExperimentsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl">История экспериментов</h2>
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
