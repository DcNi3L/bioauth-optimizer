'use client';

import { useViewer } from '@/entities/viewer';
import { BatchForm, BatchJobs } from '@/features/run-batch';
import { Notice, Panel } from '@/shared/ui';

/** Пакетный режим (UC-9): открытые наборы изображений → тысячи impostor-сравнений для подтверждения малого FAR. */
export function AdminBatchPage() {
  const viewer = useViewer().data;
  if (viewer?.role !== 'admin' && viewer?.role !== 'researcher')
    return <Notice tone="info">Пакетный режим доступен администратору и исследователю.</Notice>;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <Panel
        title="Набор изображений"
        description="Используйте только наборы, лицензия которых разрешает такое применение; сами изображения не сохраняются — только оценки."
      >
        <div className="px-5 py-4">
          <BatchForm />
        </div>
      </Panel>
      <Panel
        title="Задачи"
        description="Genuine — все пары изображений одного субъекта, impostor — пары разных субъектов."
      >
        <div className="px-5 py-4">
          <BatchJobs />
        </div>
      </Panel>
    </div>
  );
}
