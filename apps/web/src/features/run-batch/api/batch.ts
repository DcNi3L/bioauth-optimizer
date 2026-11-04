'use client';

import { batchJobSchema, z } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend, apiUpload } from '@/shared/api';
import { API_BASE } from '@/shared/config';

const batchKeys = { all: ['batch-jobs'] as const };

/** Список задач; пока есть выполняющаяся — опрос раз в секунду. */
export function useBatchJobs() {
  return useQuery({
    queryKey: batchKeys.all,
    queryFn: () => apiGet('/calibration/batch', z.array(batchJobSchema)),
    refetchInterval: (q) => (q.state.data?.some((j) => j.state === 'running') ? 1000 : false),
  });
}

export interface StartBatchInput {
  file: File;
  name: string;
  seed: number;
  maxImpostor: number;
  includeInCalibration: boolean;
}

export function useStartBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: StartBatchInput) => {
      const form = new FormData();
      form.set('file', v.file);
      if (v.name.trim()) form.set('name', v.name.trim());
      form.set('seed', String(v.seed));
      form.set('maxImpostor', String(v.maxImpostor));
      form.set('includeInCalibration', String(v.includeInCalibration));
      return apiUpload('/calibration/batch', form, batchJobSchema);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: batchKeys.all }),
  });
}

export function useCancelBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/calibration/batch/${id}`),
    onSettled: () => qc.invalidateQueries({ queryKey: batchKeys.all }),
  });
}

export const batchCsvUrl = (id: string) => `${API_BASE}/calibration/batch/${id}/csv`;
