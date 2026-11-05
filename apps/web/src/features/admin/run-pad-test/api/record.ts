'use client';

import { type PadSampleRequest, padSampleResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiSend } from '@/shared/api';

export function useRecordPadSample() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PadSampleRequest) =>
      apiSend('POST', '/pad-test/samples', body, padSampleResponseSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['calibration'] }),
  });
}
