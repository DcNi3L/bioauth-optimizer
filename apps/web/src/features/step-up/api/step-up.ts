'use client';

import { startAuthentication } from '@simplewebauthn/browser';

import { apiSend } from '@/shared/api';

type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

/** Те же проверки, что и второй шаг входа: в уже полной сессии они обновляют момент подтверждения. */
export async function confirmPasskey(): Promise<void> {
  const optionsJSON = await apiSend<AuthOptions>('POST', '/webauthn/staff/options');
  const response = await startAuthentication({ optionsJSON });
  await apiSend('POST', '/webauthn/staff/verify', response);
}

export const confirmTotp = (code: string): Promise<void> => apiSend('POST', '/mfa/totp/verify', { code });

export const confirmRecovery = (code: string): Promise<void> =>
  apiSend('POST', '/mfa/recovery/verify', { code });
