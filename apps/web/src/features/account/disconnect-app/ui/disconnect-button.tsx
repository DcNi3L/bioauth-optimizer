'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';

import { accountKeys } from '@/entities/account';
import { apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

export function DisconnectAppButton({ clientId }: { clientId: string }) {
  const t = useT();
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => apiSend('DELETE', `/oauth/apps/${encodeURIComponent(clientId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: accountKeys.apps }),
  });
  return (
    <Button size="sm" variant="danger" busy={m.isPending} onClick={() => m.mutate()}>
      {t('profile.apps.disconnect')}
    </Button>
  );
}
