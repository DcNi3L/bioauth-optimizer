'use client';

import type { CalibrateResponseDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useCalibrationOverview } from '@/entities/calibration';
import { useViewer } from '@/entities/viewer';
import { CalibrateForm } from '@/features/admin/calibrate-threshold';
import { CreateMeasuredCatalog } from '@/features/admin/create-measured-catalog';
import { useProposeFromCalibration } from '@/features/admin/manage-policy';
import { useT } from '@/shared/i18n';
import { formatNumber, formatPercent } from '@/shared/lib';
import { ApiErrorNotice, Button, Metric, Notice, Panel } from '@/shared/ui';
import { RocChart } from '@/widgets/roc-chart';
import { ThresholdErrorChart } from '@/widgets/threshold-error-chart';
import { ThresholdSummary } from '@/widgets/threshold-summary';

/**
 * Замкнутый контур (UC-6): накопленные оценки → оптимальный порог тем же алгоритмом, что и в v1 →
 * предложение новой версии политики → утверждение администратором.
 */
export function AdminCalibrationPage() {
  const t = useT();
  const viewer = useViewer().data;
  const overview = useCalibrationOverview();
  const propose = useProposeFromCalibration();
  const [result, setResult] = useState<CalibrateResponseDto | null>(null);
  const canWrite = viewer?.role === 'admin' || viewer?.role === 'researcher';
  const o = overview.data;
  if (!canWrite) return <Notice tone="info">{t('algo.calibration.roleNotice')}</Notice>;
  const experimentId = result?.threshold.experimentId ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-6">
        <Panel title={t('algo.calibration.title')} description={t('algo.calibration.desc')}>
          <div className="px-5 py-4">
            <ApiErrorNotice error={overview.error} />
            {o && <CalibrateForm data={o.data} costs={o.activePolicy.costs} onResult={setResult} />}
          </div>
        </Panel>
        <Panel title={t('algo.calibration.catalogTitle')} description={t('algo.calibration.catalogDesc')}>
          <div className="px-5 py-4">
            <CreateMeasuredCatalog />
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        {result ? (
          <>
            <Panel title={t('algo.calibration.sufficiencyTitle')}>
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label={t('algo.calibration.genuine')} value={result.sufficiency.positives} />
                  <Metric label={t('algo.calibration.impostor')} value={result.sufficiency.negatives} />
                  <Metric
                    label={t('algo.calibration.confirmedFar')}
                    value={formatPercent(result.sufficiency.confirmedFar, 3)}
                    tone="far"
                  />
                  <Metric
                    label={t('algo.calibration.target')}
                    value={formatPercent(result.sufficiency.targetFar, 3)}
                  />
                </div>
                <Notice tone={result.sufficiency.enough ? 'success' : 'caution'}>
                  {result.sufficiency.message}
                </Notice>
                {result.current && (
                  <p className="text-sm">
                    {t('algo.calibration.current', {
                      tau: formatNumber(result.current.tau, 4),
                      far: formatPercent(result.current.far, 3),
                      frr: formatPercent(result.current.frr, 3),
                      cost: formatNumber(result.current.cost, 4),
                    })}
                  </p>
                )}
              </div>
            </Panel>
            <Panel title={t('algo.calibration.optimalTitle')}>
              <div className="flex flex-col gap-5 px-5 py-4">
                <ThresholdSummary result={result.threshold} />
                <ThresholdErrorChart result={result.threshold} />
                <RocChart result={result.threshold} />
              </div>
            </Panel>
            <Panel title={t('algo.calibration.proposeTitle')} description={t('algo.calibration.proposeDesc')}>
              <div className="flex flex-col gap-3 px-5 py-4">
                {result.threshold.optimal.tau === null && (
                  <Notice tone="caution">{t('algo.calibration.noOptimum')}</Notice>
                )}
                {!result.sufficiency.enough && (
                  <Notice tone="caution">{t('algo.calibration.lowData')}</Notice>
                )}
                {!viewer.mfaComplete && <Notice tone="caution">{t('algo.calibration.needMfa')}</Notice>}
                <ApiErrorNotice error={propose.error} />
                {propose.data && (
                  <Notice tone="success">
                    {t('algo.calibration.proposed', { version: propose.data.version })}
                  </Notice>
                )}
                <div>
                  <Button
                    disabled={
                      experimentId === null || result.threshold.optimal.tau === null || propose.isSuccess
                    }
                    busy={propose.isPending}
                    onClick={() =>
                      propose.mutate({
                        faceExperimentId: result.modality === 'face' ? experimentId : null,
                        padExperimentId: result.modality === 'pad' ? experimentId : null,
                      })
                    }
                  >
                    {t('algo.calibration.proposeButton', {
                      which: result.modality === 'face' ? 'face' : 'pad',
                      tau: formatNumber(result.threshold.optimal.tau, 4),
                    })}
                  </Button>
                </div>
              </div>
            </Panel>
          </>
        ) : (
          <Panel title={t('algo.result')}>
            <p className="text-graphite px-5 py-4 text-sm">{t('algo.calibration.empty')}</p>
          </Panel>
        )}
      </div>
    </div>
  );
}
