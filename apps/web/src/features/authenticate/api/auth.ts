'use client';

import {
  type AuthSessionDto,
  authSessionSchema,
  type AuthStepResultDto,
  authStepResultSchema,
  meSchema,
  type PosePreviewDto,
  posePreviewSchema,
  type SubmitFaceRequest,
} from '@bioauth/contracts';
import { startAuthentication } from '@simplewebauthn/browser';

import { apiGet, apiSend } from '@/shared/api';

type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export const startSession = (login: string): Promise<AuthSessionDto> =>
  apiSend('POST', '/auth/sessions', { login }, authSessionSchema);

export const posePreview = (
  id: string,
  frame: { image: string; width: number; height: number },
): Promise<PosePreviewDto> => apiSend('POST', `/auth/sessions/${id}/pose`, frame, posePreviewSchema);

export const submitFace = (id: string, body: SubmitFaceRequest): Promise<AuthStepResultDto> =>
  apiSend('POST', `/auth/sessions/${id}/face`, body, authStepResultSchema);

/** Шаг passkey: отмена на устройстве сообщается серверу — она учитывается в FRR фактора. */
export async function passkeyStep(id: string): Promise<AuthStepResultDto> {
  const optionsJSON = await apiSend<AuthOptions>('POST', `/auth/sessions/${id}/passkey/options`);
  const started = performance.now();
  try {
    const response = await startAuthentication({ optionsJSON });
    return await apiSend('POST', `/auth/sessions/${id}/passkey/verify`, response, authStepResultSchema);
  } catch (err) {
    if (err instanceof Error && err.name === 'NotAllowedError') {
      return apiSend(
        'POST',
        `/auth/sessions/${id}/passkey/cancel`,
        { durationMs: Math.round(performance.now() - started) },
        authStepResultSchema,
      );
    }
    throw err;
  }
}

export async function staffLogin(login: string, password: string) {
  const r = await apiSend<{ mfaRequired: boolean }>('POST', '/identity/login', { login, password });
  const me = await apiGet('/identity/me', meSchema);
  return { mfaRequired: r.mfaRequired, passkeys: me.passkeys, totp: me.totp };
}

/** Второй фактор сотрудника: код из приложения-аутентификатора. */
export function staffTotp(code: string): Promise<void> {
  return apiSend('POST', '/mfa/totp/verify', { code });
}

/** Запасной путь: одноразовый код восстановления; возвращает, сколько кодов осталось. */
export async function staffRecovery(code: string): Promise<number> {
  const r = await apiSend<{ recoveryCodesLeft: number }>('POST', '/mfa/recovery/verify', { code });
  return r.recoveryCodesLeft;
}

export async function staffPasskey(): Promise<void> {
  const optionsJSON = await apiSend<AuthOptions>('POST', '/webauthn/staff/options');
  const response = await startAuthentication({ optionsJSON });
  await apiSend('POST', '/webauthn/staff/verify', response);
}
