'use client';

import { factorCatalogSchema, type FactorCatalogUpsertRequest } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { catalogKeys } from '@/entities/factor-catalog';
import { apiSend } from '@/shared/api';

export function useCreateCatalog() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (req: FactorCatalogUpsertRequest) =>
      apiSend('POST', '/factor-catalogs', req, factorCatalogSchema),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  });
}
