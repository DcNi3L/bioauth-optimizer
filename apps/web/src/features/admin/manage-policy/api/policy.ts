'use client';

import { authPolicySchema, type CostsDto, type PolicyStep } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { calibrationKeys } from '@/entities/calibration';
import { policyKeys } from '@/entities/policy';
import { apiSend } from '@/shared/api';

function useInvalidate() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: policyKeys.all }),
      qc.invalidateQueries({ queryKey: calibrationKeys.overview }),
    ]);
}

export function usePolicyDecision() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { id: string; action: 'approve' | 'reject' | 'rollback'; note: string | null }) =>
      apiSend('POST', `/policies/${v.id}/${v.action}`, { note: v.note }, authPolicySchema),
    onSuccess: invalidate,
  });
}

export function useProposePolicy() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: { steps: PolicyStep[]; costs: CostsDto; rationale: string | null }) =>
      apiSend('POST', '/policies', v, authPolicySchema),
    onSuccess: invalidate,
  });
}

export function useProposeFromCalibration() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (v: {
      faceExperimentId: string | null;
      padExperimentId: string | null;
      keystrokeExperimentId?: string | null;
    }) => apiSend('POST', '/calibration/propose', v, authPolicySchema),
    onSuccess: invalidate,
  });
}

/** Политика по решению оптимизатора состава факторов (#48). */
export function useProposeFromSelection() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (experimentId: string) =>
      apiSend('POST', '/calibration/propose-from-selection', { experimentId }, authPolicySchema),
    onSuccess: invalidate,
  });
}
