import { describe, expect, it } from "vitest"

import { renderableMethods } from "./method-registry"

describe("renderableMethods", () => {
  it("keeps only methods that have a registered component", () => {
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

  it("returns an empty list when nothing enabled has UI yet", () => {
    // passkey is the one known provider still awaiting its client task.
    expect(renderableMethods(["passkey"])).toEqual([])
  })

  it("returns an empty list for no enabled methods at all", () => {
    expect(renderableMethods([])).toEqual([])
  })
})
