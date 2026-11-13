'use client';

import { useSessions } from '@/entities/account';
import { useViewer } from '@/entities/viewer';
import { RevokeOthersButton } from '@/features/account/manage-sessions';
import { ConsentUpdate } from '@/features/give-consent';
import { KeystrokePanel } from '@/features/manage-keystroke';
import { MfaPanel } from '@/features/manage-mfa';
import { RegisterPasskey } from '@/features/register-passkey';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Badge, Panel, Skeleton } from '@/shared/ui';
import { SessionList } from '@/widgets/account-activity';

export function ProfileSecurityPage() {
  const t = useT();
  const me = useViewer().data;
  const sessions = useSessions(!!me);
  if (!me) return null;
  const others = (sessions.data?.length ?? 1) > 1;
  return (
    <div className="flex flex-col gap-6">
      <Panel
        title={t('profile.passkeyTitle')}
        description={t('profile.passkeyDesc')}
        actions={
          <span className="flex items-center gap-2 text-sm">
            {t('profile.mfa')}
            <Badge tone={me.mfaComplete ? 'optimum' : 'caution'} dot>
              {me.mfaComplete ? t('profile.mfaYes') : t('profile.mfaNo')}
            </Badge>
          </span>
        }
      >
        <RegisterPasskey />
      </Panel>
      <Panel title={t('mfa.title')} description={t('mfa.desc')}>
        <MfaPanel />
      </Panel>
      <ConsentUpdate me={me} />
      <Panel title={t('keystroke.title')} description={t('keystroke.desc')}>
        <KeystrokePanel />
      </Panel>
      <Panel
        title={t('profile.sessions.title')}
        description={t('profile.sessions.desc')}
        actions={<RevokeOthersButton disabled={!others} />}
      >
        <ApiErrorNotice error={sessions.error} />
        {sessions.isPending ? (
          <Skeleton className="h-20 w-full" />
        ) : (
          sessions.data && <SessionList sessions={sessions.data} />
        )}
        {sessions.data && !others && (
          <p className="text-graphite pt-2 text-sm">{t('profile.sessions.none')}</p>
        )}
      </Panel>
    </div>
  );
}
