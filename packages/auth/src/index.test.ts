import { describe, expect, it } from "vitest"

import { AUTH_PACKAGE_PLACEHOLDER } from "./index"

describe("@app/auth", () => {
  it("is wired for tests ahead of the auth-core implementation", () => {
    expect(AUTH_PACKAGE_PLACEHOLDER).toBe(true)
  })
})
