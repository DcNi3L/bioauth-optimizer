'use client';

import { Panel } from '@/shared/ui';
import { AttemptsTable } from '@/widgets/attempts-table';

export function AdminAttemptsPage() {
  return (
    <Panel
      title="Журнал попыток входа"
      description="Изображения не хранятся — только решения, оценки и время. Для аудитора оценки скрыты."
    >
      <div className="px-5 py-4">
        <AttemptsTable />
      </div>
    </Panel>
  );
}
