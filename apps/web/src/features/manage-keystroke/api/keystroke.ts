'use client';

import {
  keystrokeEnrolledSchema,
  type KeystrokeSample,
  type KeystrokeStatusDto,
  keystrokeStatusSchema,
  type KeystrokeVerifyResultDto,
  keystrokeVerifyResultSchema,
} from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/shared/api';

const key = ['keystroke', 'status'] as const;

export const useKeystrokeStatus = () =>
  useQuery<KeystrokeStatusDto>({ queryKey: key, queryFn: () => apiGet('/keystroke', keystrokeStatusSchema) });

export function useKeystrokeEnroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (samples: KeystrokeSample[]) =>
      apiSend('POST', '/keystroke/enroll', { samples }, keystrokeEnrolledSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}

export const useKeystrokeVerify = () =>
  useMutation<KeystrokeVerifyResultDto, unknown, KeystrokeSample>({
    mutationFn: (sample) => apiSend('POST', '/keystroke/verify', sample, keystrokeVerifyResultSchema),
  });

export function useKeystrokeRemove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('DELETE', '/keystroke'),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
  });
}
