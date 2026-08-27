import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres"
import { Pool } from "pg"

import * as schema from "./schema"

export type Schema = typeof schema
export type Database = NodePgDatabase<Schema>

export interface DbHandle {
  db: Database
  pool: Pool
  /** Closes the pool. Tests and scripts must call this; the app process does not. */
  close(): Promise<void>
}

/**
 * Open a database handle against an explicit connection string. Callers own
 * the lifetime — this is the seam tests use to talk to a throwaway database.
 */
export function createDb(connectionString: string): DbHandle {
  const pool = new Pool({ connectionString })
  return {
    db: drizzle(pool, { schema }),
    pool,
    close: () => pool.end(),
  }
}

export function requireDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set — packages/db cannot open a connection.")
  }
  return url
}

let handle: DbHandle | undefined

/**
 * The process-wide handle, opened on first use from DATABASE_URL. Lazy on
 * purpose: importing @app/db must not open a socket, or every unit test that
 * touches an importing module needs a live Postgres.
 */
export function getDb(): Database {
  handle ??= createDb(requireDatabaseUrl())
  return handle.db
}
