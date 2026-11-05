'use client';

import { useState } from 'react';

import { useAdminLogins } from '@/entities/admin-user';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Panel, Segmented, Skeleton } from '@/shared/ui';
import { LoginHistory } from '@/widgets/account-activity';

export function AdminLoginsPage() {
  const t = useT();
  const [mode, setMode] = useState<'all' | 'failures'>('all');
  const logins = useAdminLogins(200, mode === 'failures');
  return (
    <Panel
      actions={
        <Segmented
          label={t('admin.logins.failuresOnly')}
          value={mode}
          onChange={setMode}
          options={[
            { value: 'all', label: t('admin.dash.all') },
            { value: 'failures', label: t('admin.logins.failuresOnly') },
          ]}
        />
      }
      title={t('nav.logins')}
    >
      <ApiErrorNotice error={logins.error} />
      {logins.data ? <LoginHistory events={logins.data} showUser /> : <Skeleton className="h-64 w-full" />}
    </Panel>
  );
}
