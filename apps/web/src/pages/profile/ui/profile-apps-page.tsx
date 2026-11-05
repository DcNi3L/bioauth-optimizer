'use client';

import { useConnectedApps } from '@/entities/account';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Panel, Skeleton } from '@/shared/ui';
import { ConnectedApps } from '@/widgets/account-activity';

export function ProfileAppsPage() {
  const t = useT();
  const apps = useConnectedApps();
  return (
    <Panel title={t('profile.apps.title')} description={t('profile.apps.desc')}>
      <ApiErrorNotice error={apps.error} />
      {apps.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        apps.data && <ConnectedApps apps={apps.data} />
      )}
    </Panel>
  );
}
