'use client';

import { useQuery } from '@tanstack/react-query';
import { factorCatalogListSchema } from '@bioauth/contracts';
import { apiGet } from '@/shared/api';

export const catalogKeys = { all: ['factor-catalogs'] as const };

export function useFactorCatalogs() {
  return useQuery({ queryKey: catalogKeys.all, queryFn: () => apiGet('/factor-catalogs', factorCatalogListSchema) });
}
