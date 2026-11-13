'use client';

import {
  type CreateOauthClient,
  type OauthClientDto,
  OIDC_SCOPES,
  type UpdateOauthClient,
} from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { type SubmitEvent, useState } from 'react';

import { oauthKeys } from '@/entities/oauth-client';
import { ApiError, apiSend } from '@/shared/api';
import { type TKey, useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Checkbox, Dialog, Segmented, TextAreaField, TextField } from '@/shared/ui';

import { SecretReveal } from './secret-reveal';

const GRANTS = ['authorization_code', 'refresh_token', 'client_credentials'] as const;
type Grant = (typeof GRANTS)[number];
type Scope = (typeof OIDC_SCOPES)[number];

interface Draft {
  clientId: string;
  name: string;
  description: string;
  type: 'public' | 'confidential';
  redirectUris: string;
  postLogoutRedirectUris: string;
  grantTypes: Grant[];
  scopes: Scope[];
  firstParty: boolean;
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

const fromClient = (c: OauthClientDto | null): Draft =>
  c
    ? {
        clientId: c.clientId,
        name: c.name,
        description: c.description ?? '',
        type: c.type,
        redirectUris: c.redirectUris.join('\n'),
        postLogoutRedirectUris: c.postLogoutRedirectUris.join('\n'),
        grantTypes: c.grantTypes,
        scopes: c.scopes.filter((s): s is Scope => (OIDC_SCOPES as readonly string[]).includes(s)),
        firstParty: c.firstParty,
      }
    : {
        clientId: '',
        name: '',
        description: '',
        type: 'confidential',
        redirectUris: '',
        postLogoutRedirectUris: '',
        grantTypes: ['authorization_code', 'refresh_token'],
        scopes: ['openid', 'profile', 'email'],
        firstParty: false,
      };

/** Регистрация и правка клиента OAuth. Для нового конфиденциального клиента секрет показывается один раз. */
export function ClientFormDialog({
  open,
  onClose,
  client,
}: {
  open: boolean;
  onClose: () => void;
  client: OauthClientDto | null;
}) {
  const t = useT();
  const qc = useQueryClient();
  const [d, setD] = useState<Draft>(() => fromClient(client));
  const save = useMutation({
    mutationFn: () => {
      const common = {
        name: d.name.trim(),
        description: d.description.trim() === '' ? null : d.description.trim(),
        redirectUris: lines(d.redirectUris),
        postLogoutRedirectUris: lines(d.postLogoutRedirectUris),
        grantTypes: d.grantTypes,
        scopes: d.scopes,
        firstParty: d.firstParty,
      };
      return client
        ? apiSend<{ clientSecret: string | null }>(
            'PATCH',
            `/admin/oauth-clients/${client.clientId}`,
            common satisfies UpdateOauthClient,
          )
        : apiSend<{ clientSecret: string | null }>('POST', '/admin/oauth-clients', {
            ...common,
            clientId: d.clientId.trim(),
            type: d.type,
          } satisfies CreateOauthClient);
    },
    onSuccess: async (r) => {
      await qc.invalidateQueries({ queryKey: oauthKeys.clients });
      if (!r.clientSecret) onClose();
    },
  });
  const err = save.error instanceof ApiError ? save.error : null;
  const fieldErr = (p: string) => {
    const msgs = (err?.problem.errors ?? []).filter((e) => e.path === p || e.path.startsWith(`${p}.`));
    return msgs.length ? msgs.map((e) => e.message).join('; ') : undefined;
  };
  const toggle = <T extends string>(list: T[], v: T) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    save.mutate();
  };
  const secret = save.data?.clientSecret;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      closeLabel={t('common.close')}
      title={client ? t('admin.clients.editTitle', { name: client.name }) : t('admin.clients.create')}
    >
      {secret ? (
        <div className="flex flex-col gap-4">
          <SecretReveal secret={secret} />
          <Button variant="secondary" onClick={onClose} className="self-end">
            {t('common.close')}
          </Button>
        </div>
      ) : (
        <form onSubmit={submit} className="flex flex-col gap-4">
          {!client && (
            <>
              <TextField
                label={t('admin.clients.clientId')}
                value={d.clientId}
                required
                pattern="[A-Za-z0-9._\-]{3,64}"
                placeholder="crm-portal"
                onChange={(e) => setD({ ...d, clientId: e.target.value })}
                error={fieldErr('clientId')}
              />
              <div className="flex flex-col gap-1.5">
                <span className="text-sm text-graphite">{t('admin.clients.type')}</span>
                <Segmented
                  label={t('admin.clients.type')}
                  value={d.type}
                  onChange={(type) =>
                    setD({
                      ...d,
                      type,
                      grantTypes:
                        type === 'public'
                          ? d.grantTypes.filter((g) => g !== 'client_credentials')
                          : d.grantTypes,
                    })
                  }
                  options={[
                    { value: 'confidential', label: t('admin.clients.confidential') },
                    { value: 'public', label: t('admin.clients.public') },
                  ]}
                />
                <span className="text-xs text-graphite">
                  {d.type === 'public' ? t('admin.clients.publicHint') : t('admin.clients.confidentialHint')}
                </span>
              </div>
            </>
          )}
          <TextField
            label={t('admin.clients.name')}
            value={d.name}
            required
            maxLength={120}
            onChange={(e) => setD({ ...d, name: e.target.value })}
            error={fieldErr('name')}
          />
          <TextField
            label={t('admin.clients.description')}
            value={d.description}
            maxLength={500}
            onChange={(e) => setD({ ...d, description: e.target.value })}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextAreaField
              label={t('admin.clients.redirectUris')}
              value={d.redirectUris}
              placeholder="https://app.example.org/callback"
              onChange={(e) => setD({ ...d, redirectUris: e.target.value })}
              error={fieldErr('redirectUris')}
            />
            <TextAreaField
              label={t('admin.clients.postLogout')}
              value={d.postLogoutRedirectUris}
              placeholder="https://app.example.org/"
              onChange={(e) => setD({ ...d, postLogoutRedirectUris: e.target.value })}
              error={fieldErr('postLogoutRedirectUris')}
            />
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-graphite">{t('admin.clients.grants')}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {GRANTS.map((g) => (
                <Checkbox
                  key={g}
                  label={<code className="text-[13px]">{g}</code>}
                  checked={d.grantTypes.includes(g)}
                  disabled={g === 'client_credentials' && (client ? client.type : d.type) === 'public'}
                  onChange={() => setD({ ...d, grantTypes: toggle(d.grantTypes, g) })}
                />
              ))}
            </div>
            {fieldErr('grantTypes') && <p className="text-xs text-far">{fieldErr('grantTypes')}</p>}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm text-graphite">{t('admin.clients.scopes')}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {OIDC_SCOPES.map((s) => (
                <Checkbox
                  key={s}
                  checked={d.scopes.includes(s)}
                  onChange={() => setD({ ...d, scopes: toggle(d.scopes, s) })}
                  label={
                    <span>
                      <code className="text-[13px]">{s}</code>{' '}
                      <span className="text-xs text-graphite">— {t(`oauth.scope.${s}` as TKey)}</span>
                    </span>
                  }
                />
              ))}
            </div>
            {fieldErr('scopes') && <p className="text-xs text-far">{fieldErr('scopes')}</p>}
          </fieldset>
          <Checkbox
            label={t('admin.clients.firstParty')}
            checked={d.firstParty}
            onChange={(e) => setD({ ...d, firstParty: e.target.checked })}
          />
          {err && !err.problem.errors?.length && <ApiErrorNotice error={err} />}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" busy={save.isPending}>
              {client ? t('admin.clients.save') : t('admin.create.submit')}
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
