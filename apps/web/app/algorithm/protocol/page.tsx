import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Протокол испытаний',
  'Раздел для сотрудников: Протокол испытаний.',
  '/algorithm/protocol',
  { private: true },
);

export { AdminReportPage as default } from '@/pages/admin/report';
