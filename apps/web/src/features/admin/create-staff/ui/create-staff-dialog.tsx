'use client';

import type { AdminCreateUser, AdminUserDto } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { UserPlus, Wand2 } from 'lucide-react';
import { type SubmitEvent, useState } from 'react';

import { adminKeys } from '@/entities/admin-user';
import { roleLabel } from '@/entities/viewer';
import { ApiError, apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Dialog, Notice, SelectField, TextField } from '@/shared/ui';

const STAFF = ['researcher', 'auditor', 'admin'] as const;

function generatePassword(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => abc[b % abc.length]).join('');
}

export function CreateStaffButton({ disabled }: { disabled?: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<AdminCreateUser>({
    login: '',
    displayName: '',
    role: 'researcher',
    password: '',
    email: null,
  });
  const create = useMutation({
    mutationFn: (body: AdminCreateUser) => apiSend<AdminUserDto>('POST', '/admin/users', body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.all }),
  });
  const err = create.error instanceof ApiError ? create.error : null;
  const close = () => {
    setOpen(false);
    create.reset();
    setForm({ login: '', displayName: '', role: 'researcher', password: '', email: null });
  };
  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    create.mutate(form);
  };
  return (
    <>
      <Button onClick={() => setOpen(true)} disabled={disabled}>
        <UserPlus className="size-4" /> {t('admin.users.create')}
      </Button>
      <Dialog
        open={open}
        onClose={close}
        title={t('admin.create.title')}
        description={t('admin.create.desc')}
        closeLabel={t('common.close')}
      >
        {create.data ? (
          <div className="flex flex-col gap-4">
            <Notice tone="success" title={t('admin.create.done', { login: create.data.login })}>
              <span className="num">{form.password}</span>
            </Notice>
            <Button variant="secondary" onClick={close}>
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                label={t('admin.create.login')}
                value={form.login}
                required
                autoComplete="off"
                onChange={(e) => setForm({ ...form, login: e.target.value })}
                error={err?.fieldError('login')}
              />
              <TextField
                label={t('admin.create.displayName')}
                value={form.displayName}
                required
                onChange={(e) => setForm({ ...form, displayName: e.target.value })}
                error={err?.fieldError('displayName')}
              />
            </div>
            <SelectField
              label={t('admin.create.role')}
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as AdminCreateUser['role'] })}
            >
              {STAFF.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(t, r)}
                </option>
              ))}
            </SelectField>
            <div className="flex items-end gap-2">
              <TextField
                className="flex-1"
                label={t('admin.create.password')}
                value={form.password}
                required
                minLength={12}
                autoComplete="new-password"
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                error={err?.fieldError('password')}
              />
              <Button variant="secondary" onClick={() => setForm({ ...form, password: generatePassword() })}>
                <Wand2 className="size-4" /> {t('admin.create.generate')}
              </Button>
            </div>
            <TextField
              label={t('admin.create.email')}
              type="email"
              value={form.email ?? ''}
              onChange={(e) => setForm({ ...form, email: e.target.value === '' ? null : e.target.value })}
              error={err?.fieldError('email')}
            />
            {err && !err.problem.errors?.length && <ApiErrorNotice error={err} />}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={close}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" busy={create.isPending}>
                {t('admin.create.submit')}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
