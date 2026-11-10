import type { AuthPolicyDto, PolicyStep } from '@bioauth/contracts';

import type { TFn } from '@/shared/i18n';

export const STATUS_TONE: Record<AuthPolicyDto['status'], string> = {
  proposed: 'bg-caution-bg text-caution',
  active: 'bg-optimum-bg text-optimum',
  retired: 'bg-paper text-graphite',
  rejected: 'bg-far-bg text-far',
};

const n = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 4 });

export function describeStep(t: TFn, s: PolicyStep): string {
  if (s.factor === 'passkey') return 'passkey';
  const base = t('algo.policies.stepFace', { face: n(s.tauFace), pad: n(s.tauPad), n: s.commands });
  return s.calibrated ? base : `${base} ${t('algo.policies.stepUncalibrated')}`;
}
