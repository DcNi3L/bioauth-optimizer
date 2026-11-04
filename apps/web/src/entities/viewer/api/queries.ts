'use client';

import { type MeDto, meSchema } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ApiError, apiGet, apiSend } from '@/shared/api';

export const viewerKeys = { me: ['viewer', 'me'] as const };

/** Текущий пользователь; null — вход не выполнен (401). */
export function useViewer() {
  return useQuery({
    queryKey: viewerKeys.me,
    queryFn: async (): Promise<MeDto | null> => {
      try {
        return await apiGet('/identity/me', meSchema);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
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
