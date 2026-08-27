import { describe, expect, it } from "vitest"

import { APP_NAME } from "./constants"

describe("mobile workspace", () => {
  it("is wired for tests ahead of the Better Auth Expo client", () => {
    expect(APP_NAME).toBe("Obvious Auth")
  })
})
