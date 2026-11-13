'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { accountKeys } from '@/entities/account';
import { apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/identity/sessions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
}

export function RevokeSessionButton({ id }: { id: string }) {
  const t = useT();
  const m = useRevokeSession();
  return (
    <Button size="sm" variant="secondary" busy={m.isPending} onClick={() => m.mutate(id)}>
      {t('profile.sessions.end')}
    </Button>
  );
}

export function RevokeOthersButton({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => apiSend<{ revoked: number }>('POST', '/identity/sessions/revoke-others'),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.sessions }),
  });
  return (
    <div className="flex items-center gap-3">
      {m.data && (
        <span className="text-sm text-graphite" role="status">
          {t('profile.sessions.ended', { n: m.data.revoked })}
        </span>
      )}
      <Button size="sm" variant="danger" disabled={disabled} busy={m.isPending} onClick={() => m.mutate()}>
        {t('profile.sessions.endOthers')}
      </Button>
    </div>
  );
}
