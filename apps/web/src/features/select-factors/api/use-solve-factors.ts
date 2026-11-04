'use client';

import { type FactorSelectionRequest, factorSelectionResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSend } from '@/shared/api';

export function useSolveFactors() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: FactorSelectionRequest) =>
      apiSend('POST', '/factor-selection/solve', req, factorSelectionResponseSchema),
    onSettled: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}
