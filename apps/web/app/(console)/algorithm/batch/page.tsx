import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Пакетный режим',
  'Раздел для сотрудников: Пакетный режим.',
  '/algorithm/batch',
  { private: true },
);

export { AdminBatchPage as default } from '@/pages/admin/batch';
