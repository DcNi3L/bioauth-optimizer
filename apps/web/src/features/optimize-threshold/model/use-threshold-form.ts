'use client';

import { useCallback, useState } from 'react';
import { thresholdOptimizeRequestSchema, type ThresholdOptimizeRequest } from '@bioauth/contracts';
import { numberToInput, parseNumber } from '@/shared/lib';

export type ThresholdMode = 'gaussian' | 'empirical';

export interface ThresholdFormValues {
  mode: ThresholdMode;
  genuineMean: string;
  genuineStd: string;
  impostorMean: string;
  impostorStd: string;
  cFA: string;
  cFR: string;
  farMax: string;
  curveFrom: string;
  curveTo: string;
}

const INITIAL: ThresholdFormValues = {
  mode: 'gaussian',
  genuineMean: '',
  genuineStd: '',
  impostorMean: '',
  impostorStd: '',
  cFA: '10',
  cFR: '1',
  farMax: '',
  curveFrom: '',
  curveTo: '',
};

/** Путь поля в запросе → ключ формы (для показа ошибок валидации рядом с полем). */
const FIELD_BY_PATH: Record<string, keyof ThresholdFormValues> = {
  'model.genuine.mean': 'genuineMean',
  'model.genuine.std': 'genuineStd',
  'model.impostor.mean': 'impostorMean',
  'model.impostor.std': 'impostorStd',
  'costs.cFA': 'cFA',
  'costs.cFR': 'cFR',
  'constraints.farMax': 'farMax',
  'curve.from': 'curveFrom',
  'curve.to': 'curveTo',
};

export type FieldErrors = Partial<Record<keyof ThresholdFormValues | 'dataset', string>>;

export function useThresholdForm() {
  const [values, setValues] = useState<ThresholdFormValues>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});

  const set = useCallback(<K extends keyof ThresholdFormValues>(key: K, value: ThresholdFormValues[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }, []);

  const fill = useCallback((req: ThresholdOptimizeRequest) => {
    if (req.model.kind !== 'gaussian') return;
    setValues({
      mode: 'gaussian',
      genuineMean: numberToInput(req.model.genuine.mean),
      genuineStd: numberToInput(req.model.genuine.std),
      impostorMean: numberToInput(req.model.impostor.mean),
      impostorStd: numberToInput(req.model.impostor.std),
      cFA: numberToInput(req.costs.cFA),
      cFR: numberToInput(req.costs.cFR),
      farMax: numberToInput(req.constraints?.farMax ?? null),
      curveFrom: numberToInput(req.curve?.from),
      curveTo: numberToInput(req.curve?.to),
    });
    setErrors({});
  }, []);

  /** Собирает запрос и проверяет его той же zod-схемой, что и сервер. null — есть ошибки. */
  const build = useCallback(
    (datasetId: string | null): ThresholdOptimizeRequest | null => {
      const num = (s: string) => parseNumber(s) ?? Number.NaN;
      const opt = (s: string) => parseNumber(s) ?? undefined;
      if (values.mode === 'empirical' && !datasetId) {
        setErrors({ dataset: 'Сначала загрузите CSV с оценками' });
        return null;
      }
      const from = opt(values.curveFrom);
      const to = opt(values.curveTo);
      const request: ThresholdOptimizeRequest = {
        model:
          values.mode === 'gaussian'
            ? {
                kind: 'gaussian',
                genuine: { mean: num(values.genuineMean), std: num(values.genuineStd) },
                impostor: { mean: num(values.impostorMean), std: num(values.impostorStd) },
              }
            : { kind: 'empirical', datasetId: datasetId! },
        costs: { cFA: num(values.cFA), cFR: num(values.cFR) },
        constraints: { farMax: parseNumber(values.farMax) },
        curve: { points: 201, ...(from !== undefined && { from }), ...(to !== undefined && { to }) },
      };
      const parsed = thresholdOptimizeRequestSchema.safeParse(request);
      if (parsed.success) {
        setErrors({});
        return request;
      }
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const key = FIELD_BY_PATH[issue.path.join('.')];
        if (key && !next[key]) next[key] = issue.code === 'invalid_type' ? 'Введите число' : issue.message;
      }
      setErrors(next);
      return null;
    },
    [values],
  );

  return { values, errors, set, fill, build };
}
