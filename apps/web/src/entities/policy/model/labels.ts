import type { AuthPolicyDto, PolicyStep } from '@bioauth/contracts';

export const STATUS_LABELS: Record<AuthPolicyDto['status'], string> = {
  proposed: 'предложена',
  active: 'активна',
  retired: 'выведена',
  rejected: 'отклонена',
};

export const STATUS_TONE: Record<AuthPolicyDto['status'], string> = {
  proposed: 'bg-caution-bg text-caution',
  active: 'bg-[#e7f3ec] text-optimum',
  retired: 'bg-paper text-graphite',
  rejected: 'bg-[#fbecee] text-far',
};

const n = (x: number) => x.toLocaleString('ru-RU', { maximumFractionDigits: 4 });

export function describeStep(s: PolicyStep): string {
  if (s.factor === 'passkey') return 'passkey';
  return `лицо: τ_face ${n(s.tauFace)}, τ_pad ${n(s.tauPad)}, команд ${s.commands}${s.calibrated ? '' : ' (не откалибровано)'}`;
}
