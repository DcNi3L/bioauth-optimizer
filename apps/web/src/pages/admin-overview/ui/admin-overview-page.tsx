'use client';

import Link from 'next/link';

import { useCalibrationOverview, useMeasuredFactors } from '@/entities/calibration';
import { describeStep, usePolicies } from '@/entities/policy';
import { formatNumber } from '@/shared/lib';
import { ApiErrorNotice, Metric, Panel } from '@/shared/ui';
import { CalibrationData } from '@/widgets/calibration-data';
import { MeasuredFactors } from '@/widgets/measured-factors';

/** Обзор: действующая политика, ожидающие решения версии, накопленные оценки и измеренные факторы. */
export function AdminOverviewPage() {
  const overview = useCalibrationOverview();
  const policies = usePolicies();
  const factors = useMeasuredFactors();
  const active = policies.data?.find((p) => p.status === 'active');
  const pending = policies.data?.filter((p) => p.status === 'proposed') ?? [];
  const o = overview.data;
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title="Действующая политика"
        description="Порядок шагов входа и пороги, по которым сейчас принимаются решения."
      >
        <div className="flex flex-col gap-3 px-5 py-4">
          <ApiErrorNotice error={policies.error ?? overview.error} />
          {active && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Metric label="Версия" value={`v${active.version}`} />
                <Metric label="τ_face" value={formatNumber(o?.activePolicy.tauFace ?? null, 4)} />
                <Metric label="τ_pad" value={formatNumber(o?.activePolicy.tauPad ?? null, 4)} />
              </div>
              <ol className="list-inside list-decimal text-sm">
                {active.steps.map((s, i) => (
                  <li key={i}>{describeStep(s)}</li>
                ))}
              </ol>
            </>
          )}
          {pending.length > 0 && (
            <p className="text-sm">
              Ожидают решения: {pending.map((p) => `v${p.version}`).join(', ')} —{' '}
              <Link href="/admin/policies" className="text-frr underline underline-offset-4">
                перейти к политикам
              </Link>
            </p>
          )}
        </div>
      </Panel>
      <Panel
        title="Накопленные оценки"
        description="Чем больше оценок, тем меньший FAR можно подтвердить при калибровке (правило трёх)."
      >
        <div className="px-5 py-4">{o && <CalibrationData data={o.data} />}</div>
      </Panel>
      <Panel
        className="lg:col-span-2"
        title="Измеренные факторы"
        description="FRR и время по журналу попыток; FAR passkey — заявленный производителем."
      >
        <div className="px-5 py-4">
          <ApiErrorNotice error={factors.error} />
          {factors.data && <MeasuredFactors data={factors.data} />}
        </div>
      </Panel>
    </div>
  );
}
