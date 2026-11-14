'use client';

import { useSessions } from '@/entities/account';
import { isStaff, useViewer } from '@/entities/viewer';
import { RevokeOthersButton } from '@/features/account/manage-sessions';
import { ConsentUpdate } from '@/features/give-consent';
import { KeystrokePanel } from '@/features/manage-keystroke';
import { MfaPanel } from '@/features/manage-mfa';
import { RegisterPasskey } from '@/features/register-passkey';
import { ConfirmMfaButton } from '@/features/step-up';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Badge, Notice, Panel, Skeleton } from '@/shared/ui';
import { SessionList } from '@/widgets/account-activity';

export function ProfileSecurityPage() {
  const t = useT();
  const me = useViewer().data;
  const sessions = useSessions(!!me);
  if (!me) return null;
  const others = (sessions.data?.length ?? 1) > 1;
  const confirm = isStaff(me.role) && !me.mfaComplete && (me.passkeys > 0 || me.totp);
  return (
    <div className="flex flex-col gap-6">
      {confirm && (
        <Notice tone="caution" title={t('profile.staffNoMfa')}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{t('stepUp.finishDesc')}</span>
            <ConfirmMfaButton />
          </span>
        </Notice>
      )}
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
          <p className="pt-2 text-sm text-graphite">{t('profile.sessions.none')}</p>
        )}
      </Panel>
    </div>
  );
}
