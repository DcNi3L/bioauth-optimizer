'use client';

import type { OauthClientDto } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, KeyRound, Pencil, Power, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { oauthKeys } from '@/entities/oauth-client';
import { apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Dialog } from '@/shared/ui';

import { ClientFormDialog } from './client-form-dialog';
import { SecretReveal } from './secret-reveal';

export function ClientActions({ client }: { client: OauthClientDto }) {
  const t = useT();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: oauthKeys.clients });
  const patch = useMutation({
    mutationFn: (body: { disabled?: boolean; rotateSecret?: true }) =>
      apiSend<{ clientSecret: string | null }>('PATCH', `/admin/oauth-clients/${client.clientId}`, body),
    onSuccess: invalidate,
  });
  const del = useMutation({
    mutationFn: () => apiSend('DELETE', `/admin/oauth-clients/${client.clientId}`),
    onSuccess: invalidate,
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => setEditing(true)}>
          <Pencil className="size-3.5" /> {t('common.edit')}
        </Button>
        {client.type === 'confidential' && (
          <Button
            size="sm"
            variant="secondary"
            busy={patch.isPending && !!patch.variables.rotateSecret}
            onClick={() => patch.mutate({ rotateSecret: true })}
          >
            <KeyRound className="size-3.5" /> {t('admin.clients.rotate')}
          </Button>
        )}
        <Button
          size="sm"
          variant="secondary"
          busy={patch.isPending && patch.variables.disabled !== undefined}
          onClick={() => patch.mutate({ disabled: !client.disabled })}
        >
          {client.disabled ? <Power className="size-3.5" /> : <Ban className="size-3.5" />}
          {client.disabled ? t('admin.clients.enable') : t('admin.clients.disable')}
        </Button>
        <Button size="sm" variant="danger" onClick={() => setConfirm(true)}>
          <Trash2 className="size-3.5" /> {t('admin.clients.delete')}
        </Button>
      </div>
      {patch.data?.clientSecret && <SecretReveal secret={patch.data.clientSecret} />}
      <ApiErrorNotice error={patch.error ?? del.error} />
      {editing && <ClientFormDialog open client={client} onClose={() => setEditing(false)} />}
      <Dialog
        open={confirm}
        onClose={() => setConfirm(false)}
        size="sm"
        closeLabel={t('common.close')}
        title={t('admin.clients.delete')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirm(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" busy={del.isPending} onClick={() => del.mutate()}>
              {t('admin.clients.delete')}
            </Button>
          </>
        }
      >
        <p className="text-sm">{t('admin.clients.confirmDelete', { name: client.name })}</p>
      </Dialog>
    </div>
  );
}
