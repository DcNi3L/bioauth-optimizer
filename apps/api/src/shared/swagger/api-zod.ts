import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiOkResponse, ApiQuery } from '@nestjs/swagger';
import { z } from '@bioauth/contracts';

type JsonSchema = Record<string, unknown>;

/** OpenAPI-схема из zod (ADR-0009). Draft 2020-12 приводится к виду, понятному Swagger UI. */
export function zodToOpenApi(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, { io, unrepresentable: 'any', target: 'openapi-3.0' }) as JsonSchema;
  delete json.$schema;
  return json;
}

export const ApiZodBody = (schema: z.ZodType, description?: string) =>
  ApiBody({ schema: zodToOpenApi(schema, 'input') as never, description });

export const ApiZodOk = (schema: z.ZodType, description?: string) =>
  ApiOkResponse({ schema: zodToOpenApi(schema, 'output') as never, description });

export const ApiZodQuery = (name: string, description: string, required = false) =>
  applyDecorators(ApiQuery({ name, description, required }));
