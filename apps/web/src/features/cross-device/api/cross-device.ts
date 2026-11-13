'use client';

import {
  type CrossDeviceDetailsDto,
  crossDeviceDetailsSchema,
  type CrossDeviceStartDto,
  crossDeviceStartSchema,
  type CrossDeviceStatusDto,
  crossDeviceStatusSchema,
} from '@bioauth/contracts';
import { startAuthentication } from '@simplewebauthn/browser';

import { apiSend } from '@/shared/api';

type AuthOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

export const startRequest = (): Promise<CrossDeviceStartDto> =>
  apiSend('POST', '/cross-device', undefined, crossDeviceStartSchema);

export const pollStatus = (id: string, pollSecret: string): Promise<CrossDeviceStatusDto> =>
  apiSend('POST', `/cross-device/${id}/status`, { pollSecret }, crossDeviceStatusSchema);

export const completeRequest = (id: string, pollSecret: string): Promise<void> =>
  apiSend('POST', `/cross-device/${id}/complete`, { pollSecret });

export const requestDetails = (id: string, key: string): Promise<CrossDeviceDetailsDto> =>
  apiSend('POST', `/cross-device/${id}/details`, { key }, crossDeviceDetailsSchema);

export const approveRequest = (id: string, key: string, number: number): Promise<void> =>
  apiSend('POST', `/cross-device/${id}/approve`, { key, number });

export const denyRequest = (id: string, key: string): Promise<void> =>
  apiSend('POST', `/cross-device/${id}/deny`, { key });

/** Свежая проверка на телефоне: passkey этого устройства обновляет момент подтверждения сессии. */
export async function confirmWithPasskey(): Promise<void> {
  const optionsJSON = await apiSend<AuthOptions>('POST', '/webauthn/staff/options');
  const response = await startAuthentication({ optionsJSON });
  await apiSend('POST', '/webauthn/staff/verify', response);
}
