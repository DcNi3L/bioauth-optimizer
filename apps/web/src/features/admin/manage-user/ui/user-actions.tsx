'use client';

import type { AdminUpdateUser, AdminUserDto, Role } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Ban, LockOpen, LogOut, Power } from 'lucide-react';
import { useState } from 'react';

import { adminKeys } from '@/entities/admin-user';
import { roleLabel } from '@/entities/viewer';
import { apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, SelectField } from '@/shared/ui';

const ROLES: Role[] = ['subject', 'admin', 'researcher', 'auditor'];

/** Действия администратора над учётной записью; сервер запрещает менять себя и последнего администратора. */
export function UserActions({
  user,
  self,
  canEdit,
}: {
  user: AdminUserDto;
  self: boolean;
  canEdit: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const qc = useQueryClient();
  const [role, setRole] = useState<Role>(user.role);
  const invalidate = () => qc.invalidateQueries({ queryKey: adminKeys.all });
  const update = useMutation({
    mutationFn: (body: AdminUpdateUser) => apiSend('PATCH', `/admin/users/${user.id}`, body),
    onSuccess: invalidate,
  });
  const revoke = useMutation({
    mutationFn: () => apiSend<{ revoked: number }>('DELETE', `/admin/users/${user.id}/sessions`),
    onSuccess: invalidate,
  });
  const locked = !!user.lockedUntil && new Date(user.lockedUntil) > new Date();
  const disabled = !canEdit || self;
  return (
    <div className="flex flex-col gap-4">
      {self && <Notice tone="info">{t('admin.user.selfNote')}</Notice>}
      {!canEdit && <Notice tone="info">{t('admin.readOnly')}</Notice>}
      {user.disabled && <Notice tone="error">{t('admin.user.disabledNote')}</Notice>}
      {locked && (
        <Notice tone="caution">{t('admin.user.lockedUntil', { date: f.dateTime(user.lockedUntil!) })}</Notice>
      )}
      <div className="flex flex-wrap items-end gap-2">
        <SelectField
          label={t('admin.user.changeRole')}
          value={role}
          disabled={disabled}
          onChange={(e) => setRole(e.target.value as Role)}
          className="min-w-56 flex-1"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {roleLabel(t, r)}
            </option>
          ))}
        </SelectField>
        <Button
          variant="secondary"
          disabled={disabled || role === user.role}
          busy={update.isPending && update.variables.role !== undefined}
          onClick={() => update.mutate({ role })}
        >
          {t('admin.user.saveRole')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {locked && (
          <Button variant="secondary" disabled={!canEdit} onClick={() => update.mutate({ unlock: true })}>
            <LockOpen className="size-4" /> {t('admin.user.unlock')}
          </Button>
        )}
        <Button
          variant="secondary"
          disabled={disabled}
          busy={revoke.isPending}
          onClick={() => revoke.mutate()}
        >
          <LogOut className="size-4" /> {t('admin.user.revoke')}
        </Button>
        <Button
          variant={user.disabled ? 'secondary' : 'danger'}
          disabled={disabled}
          busy={update.isPending && update.variables.disabled !== undefined}
          onClick={() => update.mutate({ disabled: !user.disabled })}
        >
          {user.disabled ? <Power className="size-4" /> : <Ban className="size-4" />}
          {user.disabled ? t('admin.user.enable') : t('admin.user.disable')}
        </Button>
      </div>
      {update.isSuccess && <Notice tone="success">{t('admin.user.updated')}</Notice>}
      {revoke.data && <Notice tone="success">{t('admin.user.revoked', { n: revoke.data.revoked })}</Notice>}
      <ApiErrorNotice error={update.error ?? revoke.error} />
    </div>
  );
}
