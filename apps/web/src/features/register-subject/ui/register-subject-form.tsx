'use client';

import { registerSubjectRequestSchema } from '@bioauth/contracts';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

import { useRegisterSubject } from '../api/register';

export function RegisterSubjectForm() {
  const t = useT();
  const register = useRegisterSubject();
  const [login, setLogin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  function submit() {
    const parsed = registerSubjectRequestSchema.safeParse({ login, displayName });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    register.mutate(parsed.data);
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        label={t('enroll.login')}
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        error={errors.login}
        hint={t('enroll.loginHint')}
        autoComplete="username"
      />
      <TextField
        label={t('enroll.name')}
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.displayName}
        autoComplete="name"
      />
      <ApiErrorNotice error={register.error} />
      <Button type="submit" busy={register.isPending} className="w-full">
        {t('enroll.create')}
      </Button>
    </form>
  );
}
