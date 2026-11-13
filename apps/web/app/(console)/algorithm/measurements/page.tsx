import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Измерения',
  'Раздел для сотрудников: Измерения.',
  '/algorithm/measurements',
  { private: true },
);

export { AdminOverviewPage as default } from '@/pages/admin/overview';
