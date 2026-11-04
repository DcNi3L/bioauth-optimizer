'use client';

import { registerSubjectRequestSchema } from '@bioauth/contracts';
import { useState } from 'react';

import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

import { useRegisterSubject } from '../api/register';

export function RegisterSubjectForm() {
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
      className="flex flex-col gap-4 sm:max-w-sm"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <TextField
        label="Логин"
        value={login}
        onChange={(e) => setLogin(e.target.value)}
        error={errors.login}
        hint="Латиница и цифры, например ivan.petrov"
        autoComplete="username"
      />
      <TextField
        label="Имя"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        error={errors.displayName}
        autoComplete="name"
      />
      <ApiErrorNotice error={register.error} />
      <div>
        <Button type="submit" busy={register.isPending}>
          Создать учётную запись
        </Button>
      </div>
    </form>
  );
}
