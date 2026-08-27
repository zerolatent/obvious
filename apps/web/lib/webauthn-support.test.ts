import { afterEach, describe, expect, it, vi } from "vitest"

import { isPasskeySupported } from "./webauthn-support"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("isPasskeySupported", () => {
  it("returns false when the browser has no PublicKeyCredential at all", () => {
    vi.stubGlobal("PublicKeyCredential", undefined)
    expect(isPasskeySupported()).toBe(false)
  })

  it("returns true when PublicKeyCredential is a constructor, as real WebAuthn browsers expose it", () => {
    vi.stubGlobal(
      "PublicKeyCredential",
      class PublicKeyCredential {},
    )
    expect(isPasskeySupported()).toBe(true)
  })

  it("returns false when PublicKeyCredential exists but isn't callable", () => {
    // Guards against a broken polyfill or extension shimming in a
    // non-function value; only a real constructor counts as support.
    vi.stubGlobal("PublicKeyCredential", { some: "object" })
    expect(isPasskeySupported()).toBe(false)
  })
})
