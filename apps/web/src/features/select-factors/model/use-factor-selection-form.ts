'use client';

import {
  type FactorDto,
  type FactorSelectionRequest,
  factorSelectionRequestSchema,
} from '@bioauth/contracts';
import { useCallback, useState } from 'react';

import { draftFromDto, draftToDto, emptyDraft, type FactorDraft } from '@/entities/factor';
import { useT } from '@/shared/i18n';
import { numberToInput, parseNumber } from '@/shared/lib';

export type SolverMode = 'auto' | 'exhaustive' | 'ilp';

export interface SelectionSettings {
  cFA: string;
  cFR: string;
  latencyMaxMs: string;
  budget: string;
  farMax: string;
  minPadFactors: string;
  solver: SolverMode;
}

const INITIAL_SETTINGS: SelectionSettings = {
  cFA: '10',
  cFR: '1',
  latencyMaxMs: '',
  budget: '',
  farMax: '',
  minPadFactors: '1',
  solver: 'auto',
};

/** Ошибки по путям запроса: «factors.2.far», «constraints.budget», «factors». */
export type SelectionErrors = Record<string, string>;

export interface SweepBase {
  factors: FactorDto[];
  costs: { cFA: number; cFR: number };
  constraints: { latencyMaxMs: number | null; farMax: number | null; minPadFactors: number };
}

export function useFactorSelectionForm() {
  const t = useT();
  const [factors, setFactors] = useState<FactorDraft[]>([emptyDraft(0)]);
  const [settings, setSettings] = useState<SelectionSettings>(INITIAL_SETTINGS);
  const [errors, setErrors] = useState<SelectionErrors>({});

  const updateFactor = useCallback((key: string, patch: Partial<FactorDraft>) => {
    setFactors((list) => list.map((f) => (f.key === key ? { ...f, ...patch } : f)));
  }, []);
  const addFactor = useCallback(() => setFactors((list) => [...list, emptyDraft(list.length)]), []);
  const removeFactor = useCallback(
    (key: string) => setFactors((list) => list.filter((f) => f.key !== key)),
    [],
  );
  const setFactorDtos = useCallback((dtos: readonly FactorDto[]) => {
    setFactors(dtos.map(draftFromDto));
    setErrors({});
  }, []);
  const setSetting = useCallback(<K extends keyof SelectionSettings>(key: K, value: SelectionSettings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
  }, []);

  const fill = useCallback((req: FactorSelectionRequest) => {
    if (req.factors) setFactors(req.factors.map(draftFromDto));
    const c = req.constraints;
    setSettings({
      cFA: numberToInput(req.costs.cFA),
      cFR: numberToInput(req.costs.cFR),
      latencyMaxMs: numberToInput(c.latencyMaxMs ?? null),
      budget: numberToInput(c.budget ?? null),
      farMax: numberToInput(c.farMax ?? null),
      minPadFactors: String(c.minPadFactors ?? 1),
      solver: req.solver ?? 'auto',
    });
    setErrors({});
  }, []);

  const build = useCallback((): FactorSelectionRequest | null => {
    const num = (s: string) => parseNumber(s) ?? Number.NaN;
    const request: FactorSelectionRequest = {
      factors: factors.map(draftToDto),
      costs: { cFA: num(settings.cFA), cFR: num(settings.cFR) },
      constraints: {
        latencyMaxMs: parseNumber(settings.latencyMaxMs),
        budget: parseNumber(settings.budget),
        farMax: parseNumber(settings.farMax),
        minPadFactors: Number(settings.minPadFactors || 0),
      },
      fusionRule: 'AND',
      solver: settings.solver,
      rankingLimit: 100,
    };
    const parsed = factorSelectionRequestSchema.safeParse(request);
    if (parsed.success) {
      setErrors({});
      return request;
    }
    const next: SelectionErrors = {};
    for (const issue of parsed.error.issues) {
      const path = issue.path.join('.');
      next[path] ??= issue.code === 'invalid_type' ? t('algo.chrome.enterNumber') : issue.message;
    }
    setErrors(next);
    return null;
  }, [factors, settings, t]);

  /** Основа для анализа бюджета: те же факторы и ограничения, кроме бюджета. */
  const buildSweepBase = useCallback((): SweepBase | null => {
    const req = build();
    if (!req) return null;
    const { budget: _budget, ...constraints } = req.constraints;
    return {
      factors: req.factors!,
      costs: req.costs,
      constraints: {
        latencyMaxMs: constraints.latencyMaxMs ?? null,
        farMax: constraints.farMax ?? null,
        minPadFactors: constraints.minPadFactors ?? 1,
      },
    };
  }, [build]);

  return {
    factors,
    settings,
    errors,
    updateFactor,
    addFactor,
    removeFactor,
    setFactorDtos,
    setSetting,
    fill,
    build,
    buildSweepBase,
    currentFactorDtos: () => factors.map(draftToDto),
  };
}

export type FactorSelectionFormState = ReturnType<typeof useFactorSelectionForm>;
