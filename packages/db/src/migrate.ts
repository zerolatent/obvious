import { fileURLToPath } from "node:url"
import path from "node:path"

import { migrate } from "drizzle-orm/node-postgres/migrator"

import { createDb, requireDatabaseUrl } from "./client"

/** Absolute path to the generated SQL migrations shipped with this package. */
export const migrationsFolder = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../drizzle",
)

/**
 * Apply every pending migration to `connectionString`. Used by the deploy
 * script and by the migration-apply test, so CI proves the exact code path a
 * deployment runs.
 */
export async function applyMigrations(connectionString: string): Promise<void> {
  const handle = createDb(connectionString)
  try {
    await migrate(handle.db, { migrationsFolder })
  } finally {
    await handle.close()
  }
}

const isEntrypoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isEntrypoint) {
  applyMigrations(requireDatabaseUrl()).then(
    () => {
      console.log("Migrations applied.")
    },
    (error: unknown) => {
      console.error("Migration failed:", error)
      process.exitCode = 1
    },
  )
}
