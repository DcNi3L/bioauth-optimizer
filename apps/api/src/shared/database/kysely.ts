import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from './schema';

export const KYSELY = Symbol('KYSELY');
export type Db = Kysely<Database>;

export function createDb(connectionString: string, max = 10): Db {
  return new Kysely<Database>({ dialect: new PostgresDialect({ pool: new Pool({ connectionString, max }) }) });
}
