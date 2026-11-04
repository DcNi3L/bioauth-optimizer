'use client';

import { auditEventSchema, chainVerificationSchema, z } from '@bioauth/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

const PAGE = 100;

export const auditKeys = { events: ['audit', 'events'] as const, verify: ['audit', 'verify'] as const };

/** Журнал аудита, новые сверху; следующая страница — записи с номером меньше последнего. */
export function useAuditEvents() {
  return useInfiniteQuery({
    queryKey: auditKeys.events,
    initialPageParam: undefined as number | undefined,
    queryFn: ({ pageParam }) =>
      apiGet(
        `/audit/events?limit=${PAGE}${pageParam === undefined ? '' : `&before=${pageParam}`}`,
        z.array(auditEventSchema),
      ),
    getNextPageParam: (last) => (last.length === PAGE ? last[last.length - 1]!.seq : undefined),
  });
}

/** Проверка цепочки хэшей запускается по кнопке: на большом журнале это полный проход. */
export function useAuditVerification() {
  return useQuery({
    queryKey: auditKeys.verify,
    queryFn: () => apiGet('/audit/verify', chainVerificationSchema),
    enabled: false,
  });
}
