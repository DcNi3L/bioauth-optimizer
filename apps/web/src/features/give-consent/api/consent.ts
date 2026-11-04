'use client';

import { consentTextSchema } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { viewerKeys } from '@/entities/viewer';
import { apiGet, apiSend } from '@/shared/api';

export function useConsentText() {
  return useQuery({
    queryKey: ['consent', 'text'],
    queryFn: () => apiGet('/consent/text', consentTextSchema),
  });
}

export function useGrantConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (textVersion: string) => apiSend('POST', '/consent', { textVersion, accepted: true }),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}

export function useRevokeConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('DELETE', '/consent'),
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}
