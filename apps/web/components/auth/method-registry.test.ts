import { describe, expect, it } from "vitest"

import { renderableMethods } from "./method-registry"

describe("renderableMethods", () => {
  it("keeps only methods that have a registered component", () => {
    expect(renderableMethods(["email-password", "google", "passkey"])).toEqual(["email-password"])
  })

  it("preserves server order among the methods it keeps", () => {
    // email-password is the only entry with a component today, but the
    // filter must not silently reorder once a second one lands.
    expect(renderableMethods(["email-password"])).toEqual(["email-password"])
  })

  it("returns an empty list when nothing enabled has UI yet", () => {
    expect(renderableMethods(["google", "apple"])).toEqual([])
  })

  it("returns an empty list for no enabled methods at all", () => {
    expect(renderableMethods([])).toEqual([])
  })
})
