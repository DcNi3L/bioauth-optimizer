'use client';

import { authPolicySchema, z } from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export const policyKeys = { all: ['policies'] as const };

export function usePolicies() {
  return useQuery({
    queryKey: policyKeys.all,
    queryFn: () => apiGet('/policies', z.array(authPolicySchema)),
  });
}
