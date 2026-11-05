import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'История экспериментов',
  'Неизменяемые и воспроизводимые эксперименты: входные данные, результат, экспорт в JSON, CSV и PNG.',
  '/algorithm/history',
);

export { ExperimentsPage as default } from '@/pages/experiments';
