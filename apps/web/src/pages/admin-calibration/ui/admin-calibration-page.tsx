'use client';

import type { CalibrateResponseDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useCalibrationOverview } from '@/entities/calibration';
import { useViewer } from '@/entities/viewer';
import { CalibrateForm } from '@/features/calibrate-threshold';
import { CreateMeasuredCatalog } from '@/features/create-measured-catalog';
import { useProposeFromCalibration } from '@/features/manage-policy';
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
  const viewer = useViewer().data;
  const overview = useCalibrationOverview();
  const propose = useProposeFromCalibration();
  const [result, setResult] = useState<CalibrateResponseDto | null>(null);
  const canWrite = viewer?.role === 'admin' || viewer?.role === 'researcher';
  const o = overview.data;
  if (!canWrite)
    return (
      <Notice tone="info">
        Калибровку запускают администратор и исследователь; аудитор видит результаты в обзоре и журнале.
      </Notice>
    );
  const experimentId = result?.threshold.experimentId ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-6">
        <Panel
          title="Калибровка порога"
          description="Оценки разных версий модели не смешиваются: после обновления модели порог калибруется заново."
        >
          <div className="px-5 py-4">
            <ApiErrorNotice error={overview.error} />
            {o && <CalibrateForm data={o.data} costs={o.activePolicy.costs} onResult={setResult} />}
          </div>
        </Panel>
        <Panel
          title="Каталог факторов из измерений"
          description="Для решателя состава факторов: FRR и задержки из журнала попыток."
        >
          <div className="px-5 py-4">
            <CreateMeasuredCatalog />
          </div>
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        {result ? (
          <>
            <Panel title="Достаточность данных">
              <div className="flex flex-col gap-3 px-5 py-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <Metric label="Подлинных" value={result.sufficiency.positives} />
                  <Metric label="Ложных" value={result.sufficiency.negatives} />
                  <Metric
                    label="Подтверждённый FAR ≤"
                    value={formatPercent(result.sufficiency.confirmedFar, 3)}
                    tone="far"
                  />
                  <Metric label="Цель" value={formatPercent(result.sufficiency.targetFar, 3)} />
                </div>
                <Notice tone={result.sufficiency.enough ? 'success' : 'caution'}>
                  {result.sufficiency.message}
                </Notice>
                {result.current && (
                  <p className="text-sm">
                    Сейчас τ = <span className="num">{formatNumber(result.current.tau, 4)}</span>: FAR{' '}
                    <span className="num">{formatPercent(result.current.far, 3)}</span>, FRR{' '}
                    <span className="num">{formatPercent(result.current.frr, 3)}</span>, E ={' '}
                    <span className="num">{formatNumber(result.current.cost, 4)}</span>.
                  </p>
                )}
              </div>
            </Panel>
            <Panel title="Оптимальный порог">
              <div className="flex flex-col gap-5 px-5 py-4">
                <ThresholdSummary result={result.threshold} />
                <ThresholdErrorChart result={result.threshold} />
                <RocChart result={result.threshold} />
              </div>
            </Panel>
            <Panel
              title="Предложить политику"
              description="Новая версия получит τ из этого расчёта; остальные параметры — как у действующей."
            >
              <div className="flex flex-col gap-3 px-5 py-4">
                {result.threshold.optimal.tau === null && (
                  <Notice tone="caution">Оптимального порога нет — предлагать политику не из чего.</Notice>
                )}
                {!result.sufficiency.enough && (
                  <Notice tone="caution">
                    Данных мало: предложение возможно, но утверждающему стоит это учесть.
                  </Notice>
                )}
                {!viewer.mfaComplete && <Notice tone="caution">Нужен двухфакторный вход.</Notice>}
                <ApiErrorNotice error={propose.error} />
                {propose.data && (
                  <Notice tone="success">
                    Предложена версия {propose.data.version}. Её утверждает администратор на вкладке
                    «Политики».
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
                    Предложить политику с τ_{result.modality === 'face' ? 'face' : 'pad'} ={' '}
                    {formatNumber(result.threshold.optimal.tau, 4)}
                  </Button>
                </div>
              </div>
            </Panel>
          </>
        ) : (
          <Panel title="Результат">
            <p className="text-graphite px-5 py-4 text-sm">
              Выберите модальность и версию модели и запустите расчёт.
            </p>
          </Panel>
        )}
      </div>
    </div>
  );
}
