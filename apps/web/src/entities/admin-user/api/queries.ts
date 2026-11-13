'use client';

import {
  adminLoginEventSchema,
  adminStatsSchema,
  adminUserDetailSchema,
  adminUsersPageSchema,
  type Role,
  z,
} from '@bioauth/contracts';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export interface UsersFilter {
  q: string;
  role: Role | '';
  status: '' | 'active' | 'locked' | 'disabled';
  offset: number;
  limit: number;
}

export const adminKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  users: (f: UsersFilter) => ['admin', 'users', f] as const,
  user: (id: string) => ['admin', 'user', id] as const,
  logins: (limit: number, failures: boolean) => ['admin', 'logins', limit, failures] as const,
};

export const useAdminStats = (enabled = true) =>
  useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => apiGet('/admin/stats', adminStatsSchema),
    enabled,
    refetchInterval: 30_000,
  });

export function useAdminUsers(f: UsersFilter, enabled = true) {
  const p = new URLSearchParams({ limit: String(f.limit), offset: String(f.offset) });
  if (f.q) p.set('q', f.q);
  if (f.role) p.set('role', f.role);
  if (f.status) p.set('status', f.status);
  return useQuery({
    queryKey: adminKeys.users(f),
    queryFn: () => apiGet(`/admin/users?${p.toString()}`, adminUsersPageSchema),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export const useAdminUser = (id: string) =>
  useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => apiGet(`/admin/users/${id}`, adminUserDetailSchema),
  });

export const useAdminLogins = (limit = 50, failures = false, enabled = true) =>
  useQuery({
    queryKey: adminKeys.logins(limit, failures),
    queryFn: () =>
      apiGet(`/admin/login-events?limit=${limit}&failures=${failures}`, z.array(adminLoginEventSchema)),
    enabled,
    refetchInterval: 30_000,
  });
