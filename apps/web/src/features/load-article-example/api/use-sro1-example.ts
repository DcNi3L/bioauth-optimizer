'use client';

import { useQuery } from '@tanstack/react-query';
import type { Sro1ExamplesDto } from '@bioauth/contracts';
import { apiGet } from '@/shared/api';

export function useSro1Example() {
  return useQuery({ queryKey: ['examples', 'sro1'], queryFn: () => apiGet<Sro1ExamplesDto>('/examples/sro1'), staleTime: Infinity });
}
