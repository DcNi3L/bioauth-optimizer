'use client';

import { oauthClientSchema, oauthRequestInfoSchema, z } from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export const oauthKeys = {
  clients: ['oauth', 'clients'] as const,
  request: (id: string) => ['oauth', 'request', id] as const,
};

export const useOauthClients = () =>
  useQuery({
    queryKey: oauthKeys.clients,
    queryFn: () => apiGet('/admin/oauth-clients', z.array(oauthClientSchema)),
  });

/** Запрос авторизации, ожидающий входа или согласия (данные для экрана). */
export const useOauthRequest = (id: string | null) =>
  useQuery({
    queryKey: oauthKeys.request(id ?? ''),
    queryFn: () => apiGet(`/oauth/requests/${id ?? ''}`, oauthRequestInfoSchema),
    enabled: !!id,
    retry: false,
  });
