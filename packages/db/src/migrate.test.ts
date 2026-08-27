import { randomBytes } from "node:crypto"

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDb, requireDatabaseUrl } from "./client"
import { applyMigrations } from "./migrate"

/**
 * Proves the generated SQL actually applies to Postgres — a schema that only
 * typechecks is a schema nobody has run. CI provides DATABASE_URL from the
 * Postgres service container.
 *
 * Off CI, Postgres is optional: a developer sandbox without a local server
 * skips this suite rather than failing the whole run. Reachability is probed,
 * not assumed from the variable being set — a stale DATABASE_URL pointing at
 * nothing is the common case, and it used to surface as a connection error
 * inside beforeAll.
 */

const adminUrl = process.env.DATABASE_URL

/**
 * A readable cause. A refused TCP connection surfaces as an AggregateError
 * whose own message is empty (one entry per resolved address), so the useful
 * text lives on the first inner error.
 */
function explainError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((inner) => explainError(inner)).join("; ")
  }
  if (error instanceof Error) return error.message || error.name
  return String(error)
}

/** null when Postgres answered; otherwise why this suite cannot run. */
async function probePostgres(url: string | undefined): Promise<string | null> {
  if (!url) return "DATABASE_URL not set"

  const client = new Client({ connectionString: url, connectionTimeoutMillis: 5_000 })
  try {
    await client.connect()
    await client.end()
    return null
  } catch (error) {
    // end() on a client that never connected rejects; the probe result is
    // already decided, so this cleanup must not mask it.
    await client.end().catch(() => {})
    return `DATABASE_URL not reachable (${url.replace(/\/\/[^@]*@/, "//")}): ${explainError(error)}`
  }
}

const skipReason = await probePostgres(adminUrl)

// In CI the database is a service container, so an unreachable one is a broken
// pipeline, not a local convenience: a skipped migration test is
// indistinguishable from a passing one in the run summary.
if (skipReason && process.env.CI) {
  throw new Error(
    `Postgres is required in CI so the migration-apply test cannot silently skip. ${skipReason}`,
  )
}

if (skipReason) {
  console.warn(`Skipping migration-apply test: ${skipReason}`)
}

const databaseName = `auth_migrate_test_${randomBytes(6).toString("hex")}`

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

describe.skipIf(skipReason !== null)("applyMigrations", () => {
  // Vitest still runs a skipped suite's factory, so this must not parse "":
  // `new URL("")` throwing here is what failed the run on a machine without
  // Postgres, before any skip decision could take effect.
  const targetUrl = adminUrl ? withDatabase(adminUrl, databaseName) : ""
  let admin: Client

  beforeAll(async () => {
    requireDatabaseUrl()
    admin = new Client({ connectionString: adminUrl })
    await admin.connect()
    await admin.query(`CREATE DATABASE "${databaseName}"`)
  })

  afterAll(async () => {
    await admin.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`)
    await admin.end()
  })

  it("creates every Better Auth table on an empty database", async () => {
    await applyMigrations(targetUrl)

    const handle = createDb(targetUrl)
    try {
      const { rows } = await handle.pool.query<{ table_name: string }>(
        `SELECT table_name FROM information_schema.tables
         WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
      )
      const tables = rows.map((row) => row.table_name)
      expect(tables).toEqual(
        expect.arrayContaining(["account", "passkey", "session", "user", "verification"]),
      )
    } finally {
      await handle.close()
    }
  })

  it("is idempotent — a second apply is a no-op", async () => {
    // The deploy script runs on every release; re-running must not fail.
    await expect(applyMigrations(targetUrl)).resolves.toBeUndefined()
  })

  it("enforces the constraints auth depends on", async () => {
    const handle = createDb(targetUrl)
    try {
      await handle.pool.query(
        `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
         VALUES ('u1', 'A', 'a@example.com', false, now(), now())`,
      )

      // Unique email: two accounts on one address would make sign-in ambiguous.
      await expect(
        handle.pool.query(
          `INSERT INTO "user" (id, name, email, email_verified, created_at, updated_at)
           VALUES ('u2', 'B', 'a@example.com', false, now(), now())`,
        ),
      ).rejects.toThrow(/duplicate key/)

      // Sessions cascade with their user, so deleting a user leaves none behind.
      await handle.pool.query(
        `INSERT INTO session (id, expires_at, token, created_at, updated_at, user_id)
         VALUES ('s1', now() + interval '1 day', 't1', now(), now(), 'u1')`,
      )
      await handle.pool.query(`DELETE FROM "user" WHERE id = 'u1'`)
      const { rows } = await handle.pool.query(`SELECT id FROM session`)
      expect(rows).toEqual([])
    } finally {
      await handle.close()
    }
  })
})
