'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BiometricLogin, StaffLogin } from '@/features/authenticate';
import { Panel, Segmented } from '@/shared/ui';

type Mode = 'subject' | 'staff';

export function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('subject');
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">Вход</h1>
        <p className="text-graphite">
          Вход по активной политике: проверка лица с тремя случайными командами и, если политика требует,
          passkey.
        </p>
      </header>
      <Segmented<Mode>
        label="Способ входа"
        value={mode}
        onChange={setMode}
        options={[
          { value: 'subject', label: 'По биометрии' },
          { value: 'staff', label: 'Сотрудник' },
        ]}
      />
      <Panel>
        {mode === 'subject' ? (
          <BiometricLogin onSuccess={() => router.push('/profile')} />
        ) : (
          <StaffLogin onSuccess={() => router.push('/profile')} />
        )}
      </Panel>
      <p className="text-graphite text-sm">
        Нет учётной записи?{' '}
        <Link href="/enroll" className="text-frr underline underline-offset-4">
          Зарегистрироваться
        </Link>
      </p>
    </div>
  );
}
