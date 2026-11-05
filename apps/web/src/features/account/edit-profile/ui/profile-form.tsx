'use client';

import type { MeDto } from '@bioauth/contracts';
import { useMutation } from '@tanstack/react-query';
import { Check } from 'lucide-react';
import { type FormEvent, useState } from 'react';

import { useRefreshViewer } from '@/entities/viewer';
import { ApiError, apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

/** Имя и почта (почта уникальна без учёта регистра; пустое поле — удалить). */
export function ProfileForm({ me }: { me: MeDto }) {
  const t = useT();
  const refresh = useRefreshViewer();
  const [name, setName] = useState(me.displayName);
  const [email, setEmail] = useState(me.email ?? '');
  const save = useMutation({
    mutationFn: () =>
      apiSend('PATCH', '/identity/me', {
        displayName: name.trim(),
        email: email.trim() === '' ? null : email.trim(),
      }),
    onSuccess: () => refresh(),
  });
  const dirty = name.trim() !== me.displayName || (email.trim() || null) !== me.email;
  const err = save.error instanceof ApiError ? save.error : null;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField
          label={t('profile.displayName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={200}
          autoComplete="name"
          error={err?.fieldError('displayName')}
        />
        <TextField
          label={t('profile.email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          autoComplete="email"
          placeholder="name@example.org"
          error={err?.fieldError('email')}
        />
      </div>
      {err && !err.fieldError('email') && !err.fieldError('displayName') && <ApiErrorNotice error={err} />}
      <div className="flex items-center gap-3">
        <Button type="submit" busy={save.isPending} disabled={!dirty || name.trim() === ''}>
          {t('common.save')}
        </Button>
        {save.isSuccess && !dirty && (
          <span className="text-optimum inline-flex items-center gap-1 text-sm" role="status">
            <Check className="size-4" /> {t('profile.saved')}
          </span>
        )}
      </div>
    </form>
  );
}
