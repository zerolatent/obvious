import { afterEach, describe, expect, it, vi } from "vitest"

import { renderableMethods } from "./method-registry"

afterEach(() => {
  vi.unstubAllGlobals()
})

describe("renderableMethods", () => {
  it("keeps only methods that have a registered component", () => {
    // jsdom has no PublicKeyCredential, so passkey is filtered here by the
    // capability gate even though it has a registered component.
    expect(renderableMethods(["email-password", "google", "passkey"])).toEqual([
      "email-password",
      "google",
    ])
  })

  it("preserves server order among the methods it keeps", () => {
    expect(renderableMethods(["apple", "email-password", "google"])).toEqual([
      "apple",
      "email-password",
      "google",
    ])
  })

  it("returns an empty list when the only enabled method fails its capability gate", () => {
    // jsdom has no PublicKeyCredential, so passkey alone renders nothing —
    // the same "hidden, never broken" outcome a real unsupported browser sees.
    expect(renderableMethods(["passkey"])).toEqual([])
  })

  it("returns an empty list for no enabled methods at all", () => {
    expect(renderableMethods([])).toEqual([])
  })

  describe("passkey capability gating", () => {
    it("keeps passkey enabled when the browser supports WebAuthn", () => {
      vi.stubGlobal(
        "PublicKeyCredential",
        class PublicKeyCredential {},
      )
      expect(renderableMethods(["email-password", "passkey"])).toEqual([
        "email-password",
        "passkey",
      ])
    })

    it("drops passkey when the server enables it but this browser can't run it", () => {
      // No PublicKeyCredential stubbed — jsdom's real default.
      expect(renderableMethods(["email-password", "passkey"])).toEqual(["email-password"])
    })

    it("never renders passkey on an unsupported browser even alone", () => {
      expect(renderableMethods(["passkey"])).toEqual([])
    })
  })
})
