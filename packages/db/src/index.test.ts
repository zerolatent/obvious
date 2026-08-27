import { describe, expect, it } from "vitest"

import { DB_PACKAGE_PLACEHOLDER } from "./index"

describe("@app/db", () => {
  it("is wired for tests ahead of the schema implementation", () => {
    expect(DB_PACKAGE_PLACEHOLDER).toBe(true)
  })
})
