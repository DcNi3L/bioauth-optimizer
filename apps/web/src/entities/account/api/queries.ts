'use client';

import { connectedAppSchema, loginEventSchema, userSessionSchema, z } from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export const accountKeys = {
  all: ['account'] as const,
  sessions: ['account', 'sessions'] as const,
  history: (limit: number) => ['account', 'history', limit] as const,
  apps: ['account', 'apps'] as const,
};

export const useSessions = (enabled = true) =>
  useQuery({
    queryKey: accountKeys.sessions,
    queryFn: () => apiGet('/identity/sessions', z.array(userSessionSchema)),
    enabled,
  });

export const useLoginHistory = (limit = 50, enabled = true) =>
  useQuery({
    queryKey: accountKeys.history(limit),
    queryFn: () => apiGet(`/identity/login-history?limit=${limit}`, z.array(loginEventSchema)),
    enabled,
  });

export const useConnectedApps = (enabled = true) =>
  useQuery({
    queryKey: accountKeys.apps,
    queryFn: () => apiGet('/oauth/apps', z.array(connectedAppSchema)),
    enabled,
  });
