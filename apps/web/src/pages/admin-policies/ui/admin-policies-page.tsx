'use client';

import { usePolicies } from '@/entities/policy';
import { useViewer } from '@/entities/viewer';
import { ProposePolicyForm } from '@/features/manage-policy';
import { ApiErrorNotice, Panel } from '@/shared/ui';
import { PolicyList } from '@/widgets/policy-list';

/** Версии политики (UC-7): утверждение, отклонение, откат; ручное предложение для испытаний. */
export function AdminPoliciesPage() {
  const viewer = useViewer().data;
  const policies = usePolicies();
  const active = policies.data?.find((p) => p.status === 'active');
  const face = active?.steps.find((s) => s.factor === 'face');
  const canPropose = viewer?.role === 'admin' || viewer?.role === 'researcher';
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Panel
        title="Версии политики"
        description="Активна ровно одна версия. Если администраторов несколько, предложение утверждает не его автор (четыре глаза)."
      >
        <div className="px-5 py-4">
          <ApiErrorNotice error={policies.error} />
          {policies.data && <PolicyList policies={policies.data} canDecide={viewer?.role === 'admin'} />}
        </div>
      </Panel>
      {canPropose && active && face?.factor === 'face' && (
        <Panel
          title="Предложить вручную"
          description="Обычно политику предлагает калибровка; ручной ввод — для испытаний и отката параметров."
        >
          <div className="px-5 py-4">
            <ProposePolicyForm
              face={face}
              costs={active.costs}
              passkey={active.steps.some((s) => s.factor === 'passkey')}
            />
          </div>
        </Panel>
      )}
    </div>
  );
}
