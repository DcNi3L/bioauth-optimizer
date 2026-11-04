import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  bioAnalyzeResponseSchema,
  bioFramesRequestSchema,
  bioLivenessRequestSchema,
  bioLivenessResponseSchema,
  bioProblemSchema,
  bioTemplateResponseSchema,
  bioVerifyRequestSchema,
  bioVerifyResponseSchema,
  type z,
} from '../src';

/** Те же файлы проверяет services/bio-engine/tests/test_contract.py против pydantic-схем сервиса. */
const DIR = join(__dirname, '..', 'fixtures', 'bio-engine');

const SCHEMAS: Record<string, z.ZodType> = {
  'analyze.request.json': bioFramesRequestSchema,
  'analyze.response.json': bioAnalyzeResponseSchema,
  'template.request.json': bioFramesRequestSchema,
  'template.response.json': bioTemplateResponseSchema,
  'verify.request.json': bioVerifyRequestSchema,
  'verify.response.json': bioVerifyResponseSchema,
  'liveness.request.json': bioLivenessRequestSchema,
  'liveness.response.json': bioLivenessResponseSchema,
  'problem.not-enough-frames.json': bioProblemSchema,
  'problem.model-mismatch.json': bioProblemSchema,
};

describe('контракт bio-engine', () => {
  it('для каждого примера есть схема', () => {
    expect(readdirSync(DIR).sort()).toEqual(Object.keys(SCHEMAS).sort());
  });

  it.each(Object.entries(SCHEMAS))('%s соответствует схеме', (file, schema) => {
    const data: unknown = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    const result = schema.safeParse(data);
    expect(result.error?.issues ?? []).toEqual([]);
  });

  it('лишние поля в запросе отклоняются', () => {
    expect(bioFramesRequestSchema.safeParse({ frames: [{ image: 'x'.repeat(20) }], extra: 1 }).success).toBe(
      false,
    );
  });
});
