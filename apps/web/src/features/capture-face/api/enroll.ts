'use client';

import { enrollFaceResponseSchema, type PosePreviewDto, posePreviewSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { viewerKeys } from '@/entities/viewer';
import { apiSend } from '@/shared/api';
import type { CapturedFrame } from '@/shared/lib/camera';

export function useEnrollFace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (frames: CapturedFrame[]) =>
      apiSend('POST', '/enrollment/face', { frames }, enrollFaceResponseSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}

export function useDeleteFace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('DELETE', '/enrollment/face'),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}

export const enrollPose = (frame: {
  image: string;
  width: number;
  height: number;
}): Promise<PosePreviewDto> => apiSend('POST', '/enrollment/pose', frame, posePreviewSchema);
