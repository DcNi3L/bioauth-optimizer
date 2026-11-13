'use client';

import type { TenantSettings, TenantSettingsDto } from '@bioauth/contracts';
import { Check, RotateCcw, Smartphone, UserPlus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { useTenantSettings, useUpdateTenantSettings } from '@/entities/tenant';
import { useViewer } from '@/entities/viewer';
import { ApiError } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, Panel, Skeleton, TextField } from '@/shared/ui';
import { BrandMark, brandStyle } from '@/widgets/auth-shell';

type Form = { [K in keyof TenantSettings]: TenantSettings[K] extends boolean ? boolean : string };

const toForm = (s: TenantSettingsDto): Form => ({
  productName: s.productName,
  accentColor: s.accentColor ?? '',
  logoUrl: s.logoUrl ?? '',
  loginTitle: s.loginTitle ?? '',
  loginSubtitle: s.loginSubtitle ?? '',
  supportUrl: s.supportUrl ?? '',
  privacyUrl: s.privacyUrl ?? '',
  termsUrl: s.termsUrl ?? '',
  allowSignup: s.allowSignup,
  allowCrossDevice: s.allowCrossDevice,
});

const PRESETS = ['#1e5f8c', '#2e7d4f', '#6d28d9', '#b3263e', '#c2410c', '#17202b'];

/** Переключатель «да/нет» с пояснением: роль switch, вся строка нажимается. */
function Toggle({
  checked,
  onChange,
  title,
  text,
  icon,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  title: string;
  text: string;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex w-full items-start gap-3 rounded-lg px-1 py-2 text-left disabled:opacity-60"
    >
      <span className="mt-0.5 text-graphite">{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-graphite">{text}</span>
      </span>
      <span
        className={`relative mt-0.5 inline-flex h-6 w-10 shrink-0 rounded-full transition-colors ${checked ? 'bg-optimum' : 'bg-rule'}`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-sheet shadow transition-transform ${checked ? 'translate-x-[1.125rem]' : 'translate-x-0.5'}`}
        />
      </span>
    </button>
  );
}

/** Миниатюра страницы входа с текущими (ещё не сохранёнными) настройками. */
function Preview({ form }: { form: Form }) {
  const t = useT();
  const accent = /^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor.toLowerCase() : null;
  const product = form.productName.trim() || 'BioAuth';
  const logo = /^https:\/\/\S+$/.test(form.logoUrl) ? form.logoUrl : null;
  const settings = { logoUrl: logo } as TenantSettingsDto;
  return (
    <div
      className="auth-backdrop flex justify-center rounded-xl border border-rule p-5"
      data-brand-accent={accent ? '' : undefined}
      style={brandStyle(accent)}
    >
      <div className="w-full max-w-[19rem] overflow-hidden rounded-xl border border-rule bg-sheet shadow-lg">
        {accent && <div className="h-1 bg-[var(--brand-accent)]" aria-hidden />}
        <div className="flex flex-col items-center gap-3 px-5 pt-6 pb-5 text-center">
          <BrandMark settings={settings} size={36} />
          <div>
            <p className="font-serif text-lg leading-tight font-semibold">
              {form.loginTitle.trim() || t('authUi.welcome')}
            </p>
            <p className="mt-1 text-xs text-graphite">
              {form.loginSubtitle.trim() || t('authUi.subtitle', { product })}
            </p>
          </div>
          <div className="flex w-full rounded-md border border-rule bg-paper p-0.5 text-[11px]">
            <span className="flex-1 rounded bg-sheet py-1 shadow-[0_0_0_1px_var(--color-rule)]">
              {t('auth.tabBiometric')}
            </span>
            {form.allowCrossDevice && <span className="flex-1 py-1 text-graphite">{t('auth.tabPhone')}</span>}
            <span className="flex-1 py-1 text-graphite">{t('auth.tabStaff')}</span>
          </div>
          <span className="h-8 w-full rounded-md border border-rule bg-sheet" aria-hidden />
          <span
            data-variant="primary"
            className="flex h-8 w-full items-center justify-center rounded-md bg-ink text-xs font-medium text-sheet"
          >
            {t('auth.continue')}
          </span>
        </div>
        {form.allowSignup && (
          <p className="border-t border-rule bg-paper/60 py-2.5 text-center text-[11px] text-graphite">
            {t('auth.noAccount')} <span className="font-medium text-frr">{t('auth.register')}</span>
          </p>
        )}
      </div>
    </div>
  );
}

function BrandingForm({ saved, canEdit }: { saved: TenantSettingsDto; canEdit: boolean }) {
  const t = useT();
  const f = useFormat();
  const update = useUpdateTenantSettings();
  const [form, setForm] = useState<Form>(() => toForm(saved));
  // Сохранённые настройки сменились (сохранение, другая вкладка) — форма берёт их, если правок не было.
  const [base, setBase] = useState(saved);
  if (base !== saved) {
    setBase(saved);
    setForm(toForm(saved));
  }
  const initial = toForm(saved);
  const dirty = (Object.keys(form) as (keyof Form)[]).filter((k) => form[k] !== initial[k]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    update.reset();
    setForm((p) => ({ ...p, [k]: v }));
  };
  const err = (k: keyof Form) => (update.error instanceof ApiError ? update.error.fieldError(k) : undefined);
  const save = () => {
    const patch = Object.fromEntries(dirty.map((k) => [k, form[k]]));
    update.mutate(patch);
  };
  const text = (k: keyof Form, label: string, hint?: string, placeholder?: string) => (
    <TextField
      label={label}
      hint={hint}
      placeholder={placeholder}
      value={form[k] as string}
      onChange={(e) => set(k, e.target.value)}
      error={err(k)}
      disabled={!canEdit}
    />
  );
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        className="flex min-w-0 flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Panel title={t('tenant.lookTitle')} description={t('tenant.lookText')}>
          <div className="grid gap-4 sm:grid-cols-2">
            {text('productName', t('tenant.productName'), t('tenant.productNameHint'))}
            <div className="flex flex-col gap-1">
              <span className="text-sm text-graphite" id="accent-label">
                {t('tenant.accent')}
              </span>
              <div className="flex items-center gap-2" role="group" aria-labelledby="accent-label">
                <input
                  type="color"
                  aria-label={t('tenant.accentPick')}
                  value={/^#[0-9a-f]{6}$/i.test(form.accentColor) ? form.accentColor : '#17202b'}
                  onChange={(e) => set('accentColor', e.target.value)}
                  disabled={!canEdit}
                  className="h-10 w-12 cursor-pointer rounded-md border border-rule bg-sheet p-1"
                />
                <input
                  aria-label={t('tenant.accentHex')}
                  value={form.accentColor}
                  placeholder={t('tenant.accentDefault')}
                  onChange={(e) => set('accentColor', e.target.value.trim())}
                  disabled={!canEdit}
                  className={`num h-10 w-full min-w-0 rounded-md border bg-sheet px-3 text-[15px] outline-none focus:border-frr ${err('accentColor') ? 'border-far' : 'border-rule'}`}
                />
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                {PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    disabled={!canEdit}
                    onClick={() => set('accentColor', c)}
                    style={{ background: c }}
                    className="flex size-6 items-center justify-center rounded-full ring-offset-2 ring-offset-sheet hover:ring-2 hover:ring-rule"
                  >
                    {form.accentColor === c && <Check className="size-3.5 text-white" aria-hidden />}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={!canEdit || form.accentColor === ''}
                  onClick={() => set('accentColor', '')}
                  className="ml-1 text-xs text-graphite underline-offset-4 hover:text-ink hover:underline disabled:opacity-50"
                >
                  {t('tenant.accentReset')}
                </button>
              </div>
              {err('accentColor') && <p className="text-xs text-far">{err('accentColor')}</p>}
            </div>
            <div className="sm:col-span-2">
              {text('logoUrl', t('tenant.logo'), t('tenant.logoHint'), 'https://…/logo.svg')}
            </div>
          </div>
        </Panel>

        <Panel title={t('tenant.textsTitle')} description={t('tenant.textsText')}>
          <div className="grid gap-4">
            {text('loginTitle', t('tenant.loginTitle'), undefined, t('authUi.welcome'))}
            {text(
              'loginSubtitle',
              t('tenant.loginSubtitle'),
              undefined,
              t('authUi.subtitle', { product: form.productName || 'BioAuth' }),
            )}
          </div>
        </Panel>

        <Panel title={t('tenant.linksTitle')} description={t('tenant.linksText')}>
          <div className="grid gap-4 sm:grid-cols-3">
            {text('supportUrl', t('authUi.support'), t('tenant.supportHint'))}
            {text('privacyUrl', t('authUi.privacy'))}
            {text('termsUrl', t('authUi.terms'))}
          </div>
        </Panel>

        <Panel title={t('tenant.loginTitleSection')} description={t('tenant.loginText')}>
          <div className="flex flex-col divide-y divide-rule">
            <Toggle
              checked={form.allowSignup}
              onChange={(v) => set('allowSignup', v)}
              title={t('tenant.allowSignup')}
              text={t('tenant.allowSignupText')}
              icon={<UserPlus className="size-[18px]" />}
              disabled={!canEdit}
            />
            <Toggle
              checked={form.allowCrossDevice}
              onChange={(v) => set('allowCrossDevice', v)}
              title={t('tenant.allowCrossDevice')}
              text={t('tenant.allowCrossDeviceText')}
              icon={<Smartphone className="size-[18px]" />}
              disabled={!canEdit}
            />
          </div>
        </Panel>

        <ApiErrorNotice error={update.error} />
        {/* Панель сохранения прилипает к низу экрана, пока есть несохранённые правки. */}
        <div
          className={`z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-sheet px-4 py-3 transition-shadow ${
            dirty.length ? 'sticky bottom-3 border-ink/20 shadow-lg' : 'border-rule'
          }`}
        >
          <p className="text-sm text-graphite" aria-live="polite">
            {update.isSuccess && !dirty.length
              ? t('tenant.saved')
              : dirty.length
                ? t('tenant.unsaved', { n: dirty.length })
                : saved.updatedAt
                  ? t('tenant.updatedAt', { date: f.dateTime(saved.updatedAt) })
                  : t('tenant.defaults')}
          </p>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={!dirty.length || update.isPending}
              onClick={() => {
                update.reset();
                setForm(initial);
              }}
            >
              <RotateCcw className="size-4" aria-hidden /> {t('tenant.discard')}
            </Button>
            <Button type="submit" busy={update.isPending} disabled={!canEdit || !dirty.length}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </form>
      <aside className="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
        <p className="text-sm font-medium">{t('tenant.preview')}</p>
        <Preview form={form} />
        <p className="text-xs text-graphite">{t('tenant.previewNote')}</p>
      </aside>
    </div>
  );
}

/** Брендинг страницы входа и параметры входа — аналог Branding → Universal Login и Authentication в Auth0. */
export function AdminBrandingPage() {
  const t = useT();
  const settings = useTenantSettings();
  const me = useViewer().data;
  const canEdit = me?.role === 'admin';
  if (settings.isPending) return <Skeleton className="h-96 w-full" />;
  if (!settings.data) return <ApiErrorNotice error={settings.error} />;
  return (
    <>
      {!canEdit && <Notice tone="info">{t('tenant.readOnly')}</Notice>}
      <BrandingForm saved={settings.data} canEdit={canEdit} />
    </>
  );
}
