'use client';

import { attemptsPageSchema, type PolicyFactor } from '@bioauth/contracts';
import { useInfiniteQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export interface AttemptFilter {
  factor: PolicyFactor | '';
  outcome: 'accept' | 'reject' | 'error' | 'cancel' | '';
}

export function useAttempts(filter: AttemptFilter) {
  return useInfiniteQuery({
    queryKey: ['attempts', filter],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => {
      const qs = new URLSearchParams({ limit: '50' });
      if (filter.factor) qs.set('factor', filter.factor);
      if (filter.outcome) qs.set('outcome', filter.outcome);
      if (pageParam) qs.set('cursor', pageParam);
      return apiGet(`/attempts?${qs.toString()}`, attemptsPageSchema);
    },
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}
