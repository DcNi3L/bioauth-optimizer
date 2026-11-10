'use client';

import { type MeDto, viewerSchema } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiSend } from '@/shared/api';

export const viewerKeys = { me: ['viewer', 'me'] as const };

/** Текущий пользователь; null — вход не выполнен. */
export function useViewer() {
  return useQuery({
    queryKey: viewerKeys.me,
    queryFn: async (): Promise<MeDto | null> => (await apiGet('/identity/viewer', viewerSchema)).user,
    staleTime: 30_000,
  });
}

export function useRefreshViewer() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: viewerKeys.me });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('POST', '/identity/logout'),
    onSuccess: () => qc.setQueryData(viewerKeys.me, null),
  });
}
