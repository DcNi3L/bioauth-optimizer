'use client';

import type { RegisterSubjectRequest } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { viewerKeys } from '@/entities/viewer';
import { apiSend } from '@/shared/api';

export function useRegisterSubject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterSubjectRequest) => apiSend('POST', '/identity/subjects', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}
