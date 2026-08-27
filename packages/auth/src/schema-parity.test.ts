import { authSchema } from "@app/db"
import { memoryAdapter } from "better-auth/adapters/memory"
import { getSchema } from "better-auth/db"
import { getTableColumns } from "drizzle-orm"
import { describe, expect, it } from "vitest"

import { createAuth } from "./server"

/**
 * Better Auth's Drizzle adapter resolves a model field to a column by the
 * *property key* on the table object. A field it knows about but the table
 * lacks is a runtime 500 on a login attempt — this test turns that into a
 * failing build instead, and will fail the day an upgrade adds a field.
 */

const { auth } = createAuth({
  env: {
    AUTH_PROVIDERS: "email-password,google,apple,passkey",
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    GOOGLE_CLIENT_ID: "id",
    GOOGLE_CLIENT_SECRET: "secret",
    APPLE_CLIENT_ID: "id",
    APPLE_CLIENT_SECRET: "secret",
  },
  database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
})

// Every provider is enabled above so the expected schema is the widest one —
// the tables are created by migration regardless of what a deployment enables.
const expectedSchema = getSchema(auth.options)

describe("Drizzle schema parity with Better Auth", () => {
  it("defines a table for every model", () => {
    expect(Object.keys(authSchema).sort()).toEqual(Object.keys(expectedSchema).sort())
  })

  it.each(Object.keys(expectedSchema))("%s has every field Better Auth writes", (model) => {
    const table = authSchema[model as keyof typeof authSchema]
    expect(table, `no Drizzle table for model "${model}"`).toBeDefined()

    const columns = Object.keys(getTableColumns(table))
    const expectedFields = Object.entries(expectedSchema[model]!.fields).map(
      ([field, attribute]) => attribute.fieldName ?? field,
    )

    // `id` is implicit in Better Auth's model definitions.
    expect(columns).toContain("id")
    for (const field of expectedFields) {
      expect(columns, `${model}.${field} missing from the Drizzle schema`).toContain(field)
    }
  })

  it.each(Object.keys(expectedSchema))("%s carries no column Better Auth cannot fill", (model) => {
    const table = authSchema[model as keyof typeof authSchema]!
    const expectedFields = new Set([
      "id",
      ...Object.entries(expectedSchema[model]!.fields).map(
        ([field, attribute]) => attribute.fieldName ?? field,
      ),
    ])

    // A NOT NULL column Better Auth never writes makes every insert fail.
    const orphanRequired = Object.entries(getTableColumns(table))
      .filter(([name, column]) => !expectedFields.has(name) && column.notNull && !column.hasDefault)
      .map(([name]) => name)

    expect(orphanRequired).toEqual([])
  })
})
