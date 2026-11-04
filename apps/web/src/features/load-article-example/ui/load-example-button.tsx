'use client';

import type { Sro1ExamplesDto } from '@bioauth/contracts';

import { Button } from '@/shared/ui';

import { useSro1Example } from '../api/use-sro1-example';

/** Заполняет форму данными модельного примера раздела 4 статьи СРО1. */
export function LoadExampleButton({ onLoad }: { onLoad: (example: Sro1ExamplesDto) => void }) {
  const example = useSro1Example();
  return (
    <Button
      variant="secondary"
      busy={example.isLoading}
      disabled={!example.data}
      onClick={() => example.data && onLoad(example.data)}
    >
      Пример из статьи СРО1
    </Button>
  );
}
