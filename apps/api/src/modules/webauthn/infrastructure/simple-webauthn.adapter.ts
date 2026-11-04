import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type AuthenticationResponseJSON,
  generateAuthenticationOptions,
  generateRegistrationOptions,
  type RegistrationResponseJSON,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import type { RegistrationResult, StoredCredential, WebAuthnPort } from '../application/ports';

/**
 * Passkey с платформенным аутентификатором (Touch ID, Windows Hello, сканер Android) — ADR-0013.
 * Требуется проверка пользователя (UV): отпечаток или иной локальный способ на устройстве.
 */
@Injectable()
export class SimpleWebAuthnAdapter implements WebAuthnPort {
  private readonly logger = new Logger('WebAuthn');

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async registrationOptions(
    user: { id: string; login: string; displayName: string },
    exclude: StoredCredential[],
  ) {
    const options = await generateRegistrationOptions({
      rpName: this.config.RP_NAME,
      rpID: this.config.RP_ID,
      userName: user.login,
      userDisplayName: user.displayName,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: exclude.map((c) => ({ id: c.credentialId, transports: c.transports })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
        authenticatorAttachment: 'platform',
      },
      timeout: 120_000,
    });
    return { options: options as unknown as Record<string, unknown>, challenge: options.challenge };
  }

  async verifyRegistration(response: unknown, challenge: string): Promise<RegistrationResult | null> {
    try {
      const r = await verifyRegistrationResponse({
        response: response as RegistrationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.config.RP_ORIGIN,
        expectedRPID: this.config.RP_ID,
        requireUserVerification: true,
      });
      if (!r.verified) return null;
      const { credential, credentialDeviceType, credentialBackedUp } = r.registrationInfo;
      return {
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      };
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'регистрация passkey отклонена');
      return null;
    }
  }

  async authenticationOptions(allow: StoredCredential[]) {
    const options = await generateAuthenticationOptions({
      rpID: this.config.RP_ID,
      allowCredentials: allow.map((c) => ({ id: c.credentialId, transports: c.transports as never })),
      userVerification: 'required',
      timeout: 120_000,
    });
    return { options: options as unknown as Record<string, unknown>, challenge: options.challenge };
  }

  async verifyAuthentication(response: unknown, challenge: string, c: StoredCredential) {
    try {
      const r = await verifyAuthenticationResponse({
        response: response as AuthenticationResponseJSON,
        expectedChallenge: challenge,
        expectedOrigin: this.config.RP_ORIGIN,
        expectedRPID: this.config.RP_ID,
        credential: {
          id: c.credentialId,
          publicKey: new Uint8Array(c.publicKey),
          counter: c.counter,
          transports: c.transports,
        },
        requireUserVerification: true,
      });
      if (!r.verified || !r.authenticationInfo.userVerified) return null;
      return { newCounter: r.authenticationInfo.newCounter };
    } catch (err) {
      this.logger.warn({ err: (err as Error).message }, 'проверка passkey отклонена');
      return null;
    }
  }
}
