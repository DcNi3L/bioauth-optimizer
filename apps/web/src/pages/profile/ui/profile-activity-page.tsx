'use client';

import { useLoginHistory } from '@/entities/account';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Panel, Skeleton } from '@/shared/ui';
import { LoginHistory } from '@/widgets/account-activity';

export function ProfileActivityPage() {
  const t = useT();
  const history = useLoginHistory(100);
  return (
    <Panel title={t('profile.history.title')} description={t('profile.history.desc')}>
      <ApiErrorNotice error={history.error} />
      {history.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        history.data && <LoginHistory events={history.data} />
      )}
    </Panel>
  );
}
