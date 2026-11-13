import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Калибровка',
  'Раздел для сотрудников: Калибровка.',
  '/algorithm/calibration',
  { private: true },
);

export { AdminCalibrationPage as default } from '@/pages/admin/calibration';
