import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Испытание PAD',
  'Раздел для сотрудников: Испытание PAD.',
  '/algorithm/pad',
  { private: true },
);

export { AdminPadTestPage as default } from '@/pages/admin/pad-test';
