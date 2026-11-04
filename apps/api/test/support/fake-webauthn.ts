import type {
  RegistrationResult,
  StoredCredential,
  WebAuthnPort,
} from '../../src/modules/webauthn/application/ports';

/**
 * Поддельный WebAuthn для e2e API: ответ «аутентификатора» — { id, type, ok }. Настоящая криптография
 * проверяется в браузерном e2e с виртуальным аутентификатором (apps/web/e2e).
 */
export class FakeWebAuthn implements WebAuthnPort {
  private n = 0;

  registrationOptions() {
    const challenge = `reg-${++this.n}`;
    return Promise.resolve({ options: { challenge }, challenge });
  }

  verifyRegistration(response: unknown, challenge: string): Promise<RegistrationResult | null> {
    const r = response as { id: string; ok?: boolean; challenge?: string };
    if (r.ok === false || r.challenge !== challenge) return Promise.resolve(null);
    return Promise.resolve({
      credentialId: r.id,
      publicKey: Buffer.from('pk'),
      counter: 0,
      transports: ['internal'],
      deviceType: 'singleDevice',
      backedUp: false,
    });
  }

  authenticationOptions(allow: StoredCredential[]) {
    const challenge = `auth-${++this.n}`;
    return Promise.resolve({ options: { challenge, allow: allow.map((c) => c.credentialId) }, challenge });
  }

  verifyAuthentication(response: unknown, challenge: string, credential: StoredCredential) {
    const r = response as { ok?: boolean; challenge?: string };
    if (r.ok === false || r.challenge !== challenge) return Promise.resolve(null);
    return Promise.resolve({ newCounter: credential.counter + 1 });
  }
}
