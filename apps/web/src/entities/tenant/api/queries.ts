'use client';

import { tenantSettingsDtoSchema, type UpdateTenantSettings } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/shared/api';

export const tenantKeys = { settings: ['tenant', 'settings'] as const };

/** Брендинг страницы входа и параметры входа: открыты всем, их показывает страница входа. */
export const useTenantSettings = () =>
  useQuery({
    queryKey: tenantKeys.settings,
    queryFn: () => apiGet('/tenant/settings', tenantSettingsDtoSchema),
    staleTime: 60_000,
  });

export function useUpdateTenantSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateTenantSettings) =>
      apiSend('PATCH', '/admin/tenant/settings', patch, tenantSettingsDtoSchema),
    onSuccess: (data) => qc.setQueryData(tenantKeys.settings, data),
  });
}
