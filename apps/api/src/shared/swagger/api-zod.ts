import { z } from '@bioauth/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';

type JsonSchema = Record<string, unknown>;

/** OpenAPI-схема из zod (ADR-0009). Draft 2020-12 приводится к виду, понятному Swagger UI. */
export function zodToOpenApi(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'openapi-3.0' }) as JsonSchema;
  delete json.$schema;
  return dropSafeIntegerBounds(json) as JsonSchema;
}

/** z.int() даёт границы ±2^53−1: в справочнике они превращаются в «примеры» вида −9007199254740991. */
function dropSafeIntegerBounds(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(dropSafeIntegerBounds);
  if (node === null || typeof node !== 'object') return node;
  const out: JsonSchema = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === 'minimum' && v === Number.MIN_SAFE_INTEGER) continue;
    if (k === 'maximum' && v === Number.MAX_SAFE_INTEGER) continue;
    out[k] = dropSafeIntegerBounds(v);
  }
  return out;
}

export const ApiZodBody = (schema: z.ZodType, description?: string) =>
  ApiBody({ schema: zodToOpenApi(schema, 'input') as never, description });

export const ApiZodOk = (schema: z.ZodType, description?: string) =>
  ApiOkResponse({ schema: zodToOpenApi(schema, 'output'), description });

export const ApiZodQuery = (name: string, description: string, required = false) =>
  applyDecorators(ApiQuery({ name, description, required }));
