import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Состав факторов',
  'Целочисленная задача выбора факторов аутентификации с правилом «И»: ограничения на задержку, бюджет, FAR и PAD, доказательство оптимальности.',
  '/algorithm/factors',
);

export { FactorsPage as default } from '@/pages/factors';
