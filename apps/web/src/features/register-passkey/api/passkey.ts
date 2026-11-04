'use client';

import { startRegistration } from '@simplewebauthn/browser';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { viewerKeys } from '@/entities/viewer';
import { apiSend } from '@/shared/api';

/** Регистрация passkey (UC-3): опции с сервера → navigator.credentials.create → проверка на сервере. */
export function useRegisterPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const optionsJSON = await apiSend<Parameters<typeof startRegistration>[0]['optionsJSON']>(
        'POST',
        '/webauthn/register/options',
      );
      const response = await startRegistration({ optionsJSON });
      return apiSend('POST', '/webauthn/register/verify', response);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: viewerKeys.me }),
  });
}
