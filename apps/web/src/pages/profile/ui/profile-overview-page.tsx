'use client';

import Link from 'next/link';

import { amrLabel } from '@/entities/account';
import { isStaff, useViewer } from '@/entities/viewer';
import { ProfileForm } from '@/features/account/edit-profile';
import { useDeleteFace } from '@/features/capture-face';
import { useRevokeConsent } from '@/features/give-consent';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Badge, Button, Notice, Panel } from '@/shared/ui';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[12rem_1fr]">
      <dt className="text-graphite text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Обзор профиля: личные данные, текущая сессия, биометрия и управление данными (UC-5). */
export function ProfileOverviewPage() {
  const t = useT();
  const f = useFormat();
  const me = useViewer().data;
  const revoke = useRevokeConsent();
  const deleteFace = useDeleteFace();
  if (!me) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-6">
        {isStaff(me.role) && !me.mfaComplete && (
          <Notice tone="caution" title={t('profile.staffNoMfa')}>
            {t('profile.staffNoMfaText')}{' '}
            <Link href="/profile/security" className="underline underline-offset-4">
              {t('profile.tab.security')}
            </Link>
          </Notice>
        )}
        <Panel title={t('profile.personal')} description={t('profile.personalDesc')}>
          <ProfileForm key={`${me.displayName}|${me.email ?? ''}`} me={me} />
        </Panel>
        <Panel title={t('profile.biometrics')} description={t('profile.biometricsDesc')}>
          <dl>
            <Row label={t('profile.consent')}>
              {me.consent
                ? t('profile.consentYes', {
                    date: f.dateTime(me.consent.grantedAt),
                    v: me.consent.textVersion,
                  })
                : t('profile.consentNo')}
            </Row>
            <Row label={t('profile.face')}>
              {me.face
                ? t('profile.faceYes', { date: f.dateTime(me.face.updatedAt), n: me.face.samples })
                : t('profile.faceNo')}
              {me.face && (
                <span className="text-graphite block text-xs">
                  {t('profile.faceModel', { m: me.face.modelVersion })}
                </span>
              )}
            </Row>
            <Row label={t('profile.passkeys')}>
              {me.passkeys > 0 ? t('profile.passkeysYes', { n: me.passkeys }) : t('profile.passkeysNo')}
            </Row>
          </dl>
        </Panel>
      </div>
      <div className="flex flex-col gap-6">
        <Panel title={t('profile.current')} description={t('profile.currentDesc')}>
          <dl>
            {isStaff(me.role) && (
              <Row label={t('profile.mfa')}>
                <Badge tone={me.mfaComplete ? 'optimum' : 'caution'} dot>
                  {me.mfaComplete ? t('profile.mfaYes') : t('profile.mfaNo')}
                </Badge>
              </Row>
            )}
            <Row label={t('profile.history.method')}>
              <span className="flex flex-wrap gap-1.5">
                {me.amr.length ? me.amr.map((a) => <Badge key={a}>{amrLabel(t, a)}</Badge>) : '—'}
              </span>
            </Row>
          </dl>
        </Panel>
        {me.role === 'subject' && (
          <Panel title={t('profile.dataTitle')} description={t('profile.dataDesc')}>
            <div className="flex flex-col gap-3">
              <ApiErrorNotice error={revoke.error ?? deleteFace.error} />
              {revoke.isSuccess && <Notice tone="success">{t('profile.revoked')}</Notice>}
              <div className="flex flex-col gap-2">
                {me.consent && (
                  <Link
                    href="/enroll"
                    className="bg-ink text-sheet hover:bg-ink-hover inline-flex h-10 items-center justify-center rounded-md px-4 text-sm font-medium"
                  >
                    {me.face ? t('profile.reenrollFace') : t('profile.enrollFace')}
                  </Link>
                )}
                <Button
                  variant="secondary"
                  disabled={!me.face}
                  busy={deleteFace.isPending}
                  onClick={() => deleteFace.mutate()}
                >
                  {t('profile.deleteFace')}
                </Button>
                <Button
                  variant="danger"
                  disabled={!me.consent}
                  busy={revoke.isPending}
                  onClick={() => revoke.mutate()}
                >
                  {t('profile.revokeConsent')}
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}
