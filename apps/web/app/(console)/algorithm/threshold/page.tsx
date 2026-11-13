import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Оптимальный порог',
  'Минимум байесовской стоимости E(τ) = cFA·FAR(τ) + cFR·FRR(τ): порог против точки равных ошибок, графики FAR, FRR и ROC.',
  '/algorithm/threshold',
);

export { ThresholdPage as default } from '@/pages/threshold';
