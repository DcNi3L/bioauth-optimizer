'use client';

import Link from 'next/link';

import { useCalibrationOverview, useMeasuredFactors } from '@/entities/calibration';
import { describeStep, usePolicies } from '@/entities/policy';
import { useT } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { ApiErrorNotice, Metric, Panel } from '@/shared/ui';
import { CalibrationData } from '@/widgets/calibration-data';
import { MeasuredFactors } from '@/widgets/measured-factors';

/** Обзор: действующая политика, ожидающие решения версии, накопленные оценки и измеренные факторы. */
export function AdminOverviewPage() {
  const t = useT();
  const overview = useCalibrationOverview();
  const policies = usePolicies();
  const factors = useMeasuredFactors();
  const active = policies.data?.find((p) => p.status === 'active');
  const pending = policies.data?.filter((p) => p.status === 'proposed') ?? [];
  const o = overview.data;
  return (
    <div className="flex flex-col gap-6">
      <Panel title={t('algo.measurements.policyTitle')} description={t('algo.measurements.policyDesc')}>
        <div className="flex flex-col gap-3">
          <ApiErrorNotice error={policies.error ?? overview.error} />
          {active && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <Metric label={t('algo.measurements.version')} value={`v${active.version}`} />
                <Metric label="τ_face" value={formatNumber(o?.activePolicy.tauFace ?? null, 4)} />
                <Metric label="τ_pad" value={formatNumber(o?.activePolicy.tauPad ?? null, 4)} />
              </div>
              <ol className="list-inside list-decimal text-sm">
                {active.steps.map((s, i) => (
                  <li key={i}>{describeStep(t, s)}</li>
                ))}
              </ol>
            </>
          )}
          {pending.length > 0 && (
            <p className="text-sm">
              {t('algo.measurements.pending', { versions: pending.map((p) => `v${p.version}`).join(', ') })}{' '}
              <Link href="/admin/policies" className="text-frr underline underline-offset-4">
                {t('algo.measurements.pendingLink')}
              </Link>
            </p>
          )}
        </div>
      </Panel>
      <Panel title={t('algo.measurements.scoresTitle')} description={t('algo.measurements.scoresDesc')}>
        <div>{o && <CalibrationData data={o.data} />}</div>
      </Panel>
      <Panel
        className="lg:col-span-2"
        title={t('algo.measurements.factorsTitle')}
        description={t('algo.measurements.factorsDesc')}
      >
        <div className="px-5 py-4">
          <ApiErrorNotice error={factors.error} />
          {factors.data && <MeasuredFactors data={factors.data} />}
        </div>
      </Panel>
    </div>
  );
}
