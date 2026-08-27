import { randomBytes } from "node:crypto"

import { Client } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { createDb, requireDatabaseUrl } from "./client"
import { applyMigrations } from "./migrate"

/**
 * Proves the generated SQL actually applies to Postgres — a schema that only
 * typechecks is a schema nobody has run. CI provides DATABASE_URL from the
 * Postgres service container.
 */

const adminUrl = process.env.DATABASE_URL

// A missing DATABASE_URL in CI must fail, not silently skip: a skipped
// migration test is indistinguishable from a passing one in the run summary.
if (!adminUrl && process.env.CI) {
  throw new Error(
    "DATABASE_URL is required in CI so the migration-apply test cannot silently skip.",
  )
}

const databaseName = `auth_migrate_test_${randomBytes(6).toString("hex")}`

function withDatabase(url: string, name: string): string {
  const parsed = new URL(url)
  parsed.pathname = `/${name}`
  return parsed.toString()
}

describe.skipIf(!adminUrl)("applyMigrations", () => {
  const targetUrl = withDatabase(adminUrl ?? "", databaseName)
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
