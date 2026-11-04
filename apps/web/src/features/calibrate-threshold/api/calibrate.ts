'use client';

import { type CalibrateRequest, calibrateResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { calibrationKeys } from '@/entities/calibration';
import { apiSend } from '@/shared/api';

export function useCalibrate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CalibrateRequest) =>
      apiSend('POST', '/calibration/threshold', body, calibrateResponseSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: calibrationKeys.overview }),
  });
}
