'use client';

import { useViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { useProposeFromSelection } from '../api/policy';

/** Кнопка «Предложить политику» под решением оптимизатора; видна администратору и исследователю. */
export function ProposeFromSelection({ experimentId }: { experimentId: string }) {
  const t = useT();
  const viewer = useViewer().data;
  const propose = useProposeFromSelection();
  if (viewer?.role !== 'admin' && viewer?.role !== 'researcher') return null;
  return (
    <div className="border-rule flex flex-col gap-3 border-t pt-4">
      <p className="text-graphite text-sm">{t('algo.factors.toPolicyHint')}</p>
      <ApiErrorNotice error={propose.error} />
      {propose.data && (
        <Notice tone="success">{t('algo.calibration.proposed', { version: propose.data.version })}</Notice>
      )}
      <div>
        <Button
          variant="secondary"
          busy={propose.isPending}
          disabled={propose.isSuccess}
          onClick={() => propose.mutate(experimentId)}
        >
          {t('algo.factors.toPolicy')}
        </Button>
      </div>
    </div>
  );
}
