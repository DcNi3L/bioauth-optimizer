'use client';

import type { Sro1ExamplesDto } from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export function useSro1Example() {
  return useQuery({
    queryKey: ['examples', 'sro1'],
    queryFn: () => apiGet<Sro1ExamplesDto>('/examples/sro1'),
    staleTime: Infinity,
  });
}
