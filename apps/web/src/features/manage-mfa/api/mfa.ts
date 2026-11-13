'use client';

import {
  type MfaStatusDto,
  mfaStatusSchema,
  recoveryCodesSchema,
  totpEnabledSchema,
  type TotpSetupDto,
  totpSetupSchema,
} from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { viewerKeys } from '@/entities/viewer';
import { apiGet, apiSend } from '@/shared/api';

export const mfaKeys = { status: ['mfa', 'status'] as const };

export const useMfaStatus = (enabled = true) =>
  useQuery<MfaStatusDto>({
    queryKey: mfaKeys.status,
    queryFn: () => apiGet('/mfa', mfaStatusSchema),
    enabled,
  });

/** После любого изменения обновляем состояние фактора и профиль (число факторов, amr, mfaComplete). */
function useRefresh() {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: mfaKeys.status }),
      qc.invalidateQueries({ queryKey: viewerKeys.me }),
    ]);
}

export const useTotpSetup = () =>
  useMutation<TotpSetupDto>({
    mutationFn: () => apiSend('POST', '/mfa/totp/setup', undefined, totpSetupSchema),
  });

export function useTotpConfirm() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => apiSend('POST', '/mfa/totp/confirm', { code }, totpEnabledSchema),
    onSuccess: refresh,
  });
}

export function useTotpDisable() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => apiSend('DELETE', '/mfa/totp', { code }),
    onSuccess: refresh,
  });
}

export function useRegenerateRecovery() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (code: string) => apiSend('POST', '/mfa/recovery/regenerate', { code }, recoveryCodesSchema),
    onSuccess: refresh,
  });
}
