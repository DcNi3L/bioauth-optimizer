'use client';

import {
  calibrationOverviewSchema,
  type CostsDto,
  measuredFactorsSchema,
  padReportSchema,
  protocolReportSchema,
} from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';

import { apiGet } from '@/shared/api';

export const calibrationKeys = {
  overview: ['calibration', 'overview'] as const,
  factors: ['calibration', 'factors'] as const,
  padReport: (threshold: number | null) => ['calibration', 'pad-report', threshold] as const,
  protocol: (costs: CostsDto | null) => ['calibration', 'protocol', costs] as const,
};

export function useCalibrationOverview({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: calibrationKeys.overview,
    queryFn: () => apiGet('/calibration/overview', calibrationOverviewSchema),
    enabled,
  });
}

export function useMeasuredFactors() {
  return useQuery({
    queryKey: calibrationKeys.factors,
    queryFn: () => apiGet('/calibration/factors', measuredFactorsSchema),
  });
}

export function usePadReport(threshold: number | null) {
  return useQuery({
    queryKey: calibrationKeys.padReport(threshold),
    queryFn: () =>
      apiGet(`/pad-test/report${threshold === null ? '' : `?threshold=${threshold}`}`, padReportSchema),
  });
}

/** Протокол §10.11: строки «до/после» по версиям политики (по умолчанию v1 и действующая). */
export function useProtocolReport(costs: CostsDto | null) {
  return useQuery({
    queryKey: calibrationKeys.protocol(costs),
    queryFn: () =>
      apiGet(`/calibration/report${costs ? `?cFA=${costs.cFA}&cFR=${costs.cFR}` : ''}`, protocolReportSchema),
  });
}
