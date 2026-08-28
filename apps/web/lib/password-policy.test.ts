import { describe, expect, it } from "vitest"

import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_MISMATCH_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  validateNewPassword,
} from "./password-policy"

const LONG_ENOUGH = "a".repeat(MIN_PASSWORD_LENGTH)

describe("validateNewPassword", () => {
  it("accepts a long-enough password that matches its confirmation", () => {
    expect(validateNewPassword(LONG_ENOUGH, LONG_ENOUGH)).toBeNull()
  })

  it("rejects one character below the minimum", () => {
    const tooShort = "a".repeat(MIN_PASSWORD_LENGTH - 1)
    expect(validateNewPassword(tooShort, tooShort)).toBe(PASSWORD_TOO_SHORT_MESSAGE)
  })

  it("rejects a mismatched confirmation", () => {
    expect(validateNewPassword(LONG_ENOUGH, `${LONG_ENOUGH}x`)).toBe(PASSWORD_MISMATCH_MESSAGE)
  })

  it("reports the length problem first when both are wrong", () => {
    // One message at a time: telling someone their four-character password is
    // both too short and mismatched is two problems for one fix.
    expect(validateNewPassword("abc", "xyz")).toBe(PASSWORD_TOO_SHORT_MESSAGE)
  })

  it("states the minimum it enforces, so the form and the message can't drift", () => {
    expect(PASSWORD_TOO_SHORT_MESSAGE).toContain(String(MIN_PASSWORD_LENGTH))
  })
})
