'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { experimentDetailSchema, experimentListSchema, type ExperimentType } from '@bioauth/contracts';
import { apiGet } from '@/shared/api';

export const experimentKeys = {
  all: ['experiments'] as const,
  list: (type: ExperimentType | 'ALL') => ['experiments', 'list', type] as const,
  detail: (id: string) => ['experiments', 'detail', id] as const,
};

export function useExperimentList(type: ExperimentType | 'ALL') {
  return useInfiniteQuery({
    queryKey: experimentKeys.list(type),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '20' });
      if (type !== 'ALL') qs.set('type', type);
      if (pageParam) qs.set('cursor', pageParam);
      return apiGet(`/experiments?${qs.toString()}`, experimentListSchema);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useExperiment(id: string) {
  return useQuery({ queryKey: experimentKeys.detail(id), queryFn: () => apiGet(`/experiments/${id}`, experimentDetailSchema) });
}
