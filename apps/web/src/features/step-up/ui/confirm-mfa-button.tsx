'use client';

import { ShieldCheck } from 'lucide-react';

import { requestStepUp } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

/**
 * Завершить вход сотрудника вторым фактором прямо из консоли: существующим passkey, кодом из приложения или кодом
 * восстановления (то же окно, что при повторной проверке).
 */
export function ConfirmMfaButton({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const t = useT();
  return (
    <Button size={size} onClick={() => void requestStepUp()}>
      <ShieldCheck className="size-4" aria-hidden /> {t('stepUp.confirmLogin')}
    </Button>
  );
}
