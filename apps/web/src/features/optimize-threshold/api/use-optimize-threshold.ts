'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { thresholdOptimizeResponseSchema, type ThresholdOptimizeRequest } from '@bioauth/contracts';
import { apiSend } from '@/shared/api';

export function useOptimizeThreshold() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: ThresholdOptimizeRequest) => apiSend('POST', '/threshold/optimize', req, thresholdOptimizeResponseSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['experiments'] }),
  });
}
