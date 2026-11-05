import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Регистрация',
  'Регистрация в BioAuth: учётная запись, согласие на обработку биометрии, снимок лица и passkey.',
  '/enroll',
);

export { EnrollPage as default } from '@/pages/enroll';
