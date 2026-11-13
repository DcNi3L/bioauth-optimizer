'use client';

import { initialTokenCreatedSchema, initialTokenSchema, z } from '@bioauth/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

import { apiGet, apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, NumberField, TextField } from '@/shared/ui';

import { CopyButton } from './secret-reveal';

const KEY = ['oauth', 'initial-tokens'] as const;

/**
 * Начальные токены для самостоятельной регистрации клиентов (RFC 7591, #47). Токен показывается один раз;
 * зарегистрированное по нему приложение выключено, пока администратор его не включит.
 */
export function InitialTokens({
  enabled,
  registrationEndpoint,
}: {
  enabled: boolean;
  registrationEndpoint?: string;
}) {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const [uses, setUses] = useState('1');
  const list = useQuery({
    queryKey: KEY,
    queryFn: () => apiGet('/admin/oauth-clients/initial-tokens', z.array(initialTokenSchema)),
  });
  const create = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/admin/oauth-clients/initial-tokens',
        { note: note.trim() || null, uses: Number(uses) || 1, ttlHours: 24 },
        initialTokenCreatedSchema,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  const del = useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/admin/oauth-clients/initial-tokens/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
  return (
    <div className="flex flex-col gap-4">
      {!enabled && <Notice tone="info">{t('admin.clients.regOff')}</Notice>}
      {registrationEndpoint && (
        <p className="text-graphite text-sm">
          {t('admin.clients.regHow')}{' '}
          <code className="break-all font-mono text-[12.5px]">POST {registrationEndpoint}</code>
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
        <TextField
          label={t('admin.clients.regNote')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <NumberField
          label={t('admin.clients.regUses')}
          value={uses}
          onChange={(e) => setUses(e.target.value)}
        />
      </div>
      <div>
        <Button busy={create.isPending} onClick={() => create.mutate()}>
          {t('admin.clients.regIssue')}
        </Button>
      </div>
      <ApiErrorNotice error={create.error ?? del.error ?? list.error} />
      {create.data && (
        <div
          className="border-caution/40 bg-caution-bg flex flex-col gap-2 rounded-lg border p-4"
          role="status"
        >
          <p className="text-caution text-xs">{t('admin.clients.regOnce')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-sheet border-rule text-ink min-w-0 flex-1 break-all rounded-md border px-3 py-2 font-mono text-[13px]">
              {create.data.token}
            </code>
            <CopyButton value={create.data.token} />
          </div>
        </div>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="divide-rule divide-y text-sm">
          {list.data.map((x) => (
            <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1">
                {x.note ?? '—'}
                <span className="text-graphite block text-xs">
                  {t('admin.clients.regLeft', { n: x.usesLeft, date: f.dateTime(x.expiresAt) })}
                </span>
              </span>
              <Button
                size="sm"
                variant="secondary"
                busy={del.isPending && del.variables === x.id}
                onClick={() => del.mutate(x.id)}
              >
                <Trash2 className="size-3.5" /> {t('admin.clients.regRevoke')}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
