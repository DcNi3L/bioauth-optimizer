'use client';

import { AppWindow, ArrowRight, Gauge, KeyRound, ScanFace, Sigma, UserRound } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { isStaff, useViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';

function Term({ children, tone }: { children: ReactNode; tone: 'far' | 'frr' }) {
  return <span className={tone === 'far' ? 'text-far' : 'text-frr'}>{children}</span>;
}

function Card({
  href,
  icon,
  title,
  text,
  tone,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  text: string;
  tone: string;
}) {
  return (
    <Link
      href={href}
      className="border-rule bg-sheet hover:border-graphite group flex flex-col gap-3 rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-lg"
    >
      <span className={`flex size-10 items-center justify-center rounded-xl [&>svg]:size-5 ${tone}`}>
        {icon}
      </span>
      <span className="flex items-center gap-1.5 font-serif text-lg font-semibold">
        {title}
        <ArrowRight className="size-4 opacity-0 transition-all group-hover:translate-x-0.5 group-hover:opacity-100" />
      </span>
      <span className="text-graphite text-sm">{text}</span>
    </Link>
  );
}

export function HomePage() {
  const t = useT();
  const me = useViewer().data;
  const staff = !!me && isStaff(me.role);
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-10 sm:px-6 sm:py-14">
      <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="flex flex-col gap-6">
          <p className="text-frr text-xs font-semibold uppercase tracking-wider">{t('home.eyebrow')}</p>
          <h1 className="text-3xl leading-tight sm:text-[42px]">{t('home.title')}</h1>
          <p className="text-graphite max-w-2xl text-[17px]">{t('home.lead')}</p>
          <div className="flex flex-wrap gap-3">
            {me ? (
              <Link
                href="/profile"
                className="bg-ink text-sheet hover:bg-ink-hover inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium"
              >
                <UserRound className="size-4" /> {t('home.ctaProfile')}
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  className="bg-ink text-sheet hover:bg-ink-hover inline-flex h-11 items-center gap-2 rounded-lg px-5 text-sm font-medium"
                >
                  <ScanFace className="size-4" /> {t('home.ctaLogin')}
                </Link>
                <Link
                  href="/enroll"
                  className="border-rule bg-sheet hover:border-graphite inline-flex h-11 items-center rounded-lg border px-5 text-sm font-medium"
                >
                  {t('home.ctaEnroll')}
                </Link>
              </>
            )}
            <Link
              href="/algorithm"
              className="text-frr inline-flex h-11 items-center gap-1.5 px-2 text-sm font-medium hover:underline"
            >
              {t('home.ctaAlgo')} <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
        <div className="border-rule bg-sheet relative overflow-hidden rounded-2xl border p-6">
          <div className="profile-cover absolute inset-0 opacity-60" aria-hidden />
          <div className="relative flex flex-col gap-4">
            <p
              className="formula text-2xl leading-relaxed sm:text-3xl"
              aria-label="E от тау равно c FA умножить на FAR от тау плюс c FR умножить на FRR от тау"
            >
              E(τ) = c<sub className="text-[0.55em]">FA</sub>·<Term tone="far">FAR(τ)</Term> + c
              <sub className="text-[0.55em]">FR</sub>·<Term tone="frr">FRR(τ)</Term> → min
            </p>
            <svg viewBox="0 0 300 120" className="h-auto w-full" aria-hidden>
              <path
                d="M0 8 C 90 10, 130 40, 165 70 S 260 112, 300 114"
                className="stroke-far"
                strokeWidth="2.5"
                fill="none"
              />
              <path
                d="M0 114 C 70 112, 120 100, 150 72 S 230 12, 300 8"
                className="stroke-frr"
                strokeWidth="2.5"
                fill="none"
              />
              <line
                x1="176"
                y1="0"
                x2="176"
                y2="120"
                className="stroke-optimum"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <circle cx="176" cy="79" r="5" className="fill-optimum" />
            </svg>
            <p className="text-sm">{t('home.example')}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          href="/algorithm"
          icon={<Sigma />}
          tone="bg-optimum-bg text-optimum"
          title={t('home.cardAlgo')}
          text={t('home.cardAlgoText')}
        />
        <Card
          href="/oauth/demo"
          icon={<KeyRound />}
          tone="bg-frr-bg text-frr"
          title={t('home.cardOidc')}
          text={t('home.cardOidcText')}
        />
        <Card
          href={me ? '/profile' : '/login'}
          icon={<UserRound />}
          tone="bg-caution-bg text-caution"
          title={t('home.cardProfile')}
          text={t('home.cardProfileText')}
        />
        <Card
          href={staff ? '/admin' : '/login'}
          icon={staff ? <Gauge /> : <AppWindow />}
          tone="bg-far-bg text-far"
          title={t('home.cardAdmin')}
          text={t('home.cardAdminText')}
        />
      </section>

      <p className="border-rule text-graphite max-w-3xl border-t pt-6 text-sm">{t('home.source')}</p>
    </div>
  );
}
