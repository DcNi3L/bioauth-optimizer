'use client';

import { type BudgetSweepRequest, budgetSweepResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSend } from '@/shared/api';

export function useBudgetSweep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: BudgetSweepRequest) =>
      apiSend('POST', '/factor-selection/budget-sweep', req, budgetSweepResponseSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}
