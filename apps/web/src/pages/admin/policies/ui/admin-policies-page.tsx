'use client';

import { usePolicies } from '@/entities/policy';
import { useViewer } from '@/entities/viewer';
import { ProposePolicyForm } from '@/features/admin/manage-policy';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Panel } from '@/shared/ui';
import { PolicyList } from '@/widgets/policy-list';

/** Версии политики (UC-7): утверждение, отклонение, откат; ручное предложение для испытаний. */
export function AdminPoliciesPage() {
  const t = useT();
  const viewer = useViewer().data;
  const policies = usePolicies();
  const active = policies.data?.find((p) => p.status === 'active');
  const canPropose = viewer?.role === 'admin' || viewer?.role === 'researcher';
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <Panel title={t('algo.policies.title')} description={t('algo.policies.desc')}>
        <div>
          <ApiErrorNotice error={policies.error} />
          {policies.data && <PolicyList policies={policies.data} canDecide={viewer?.role === 'admin'} />}
        </div>
      </Panel>
      {canPropose && active && (
        <Panel
          title={t('algo.policies.manualTitle')}
          description={t('algo.policies.manualDesc')}
          className="h-fit lg:sticky lg:top-20"
        >
          <div>
            <ProposePolicyForm steps={active.steps} costs={active.costs} />
          </div>
        </Panel>
      )}
    </div>
  );
}
