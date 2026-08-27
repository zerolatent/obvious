import { describe, expect, it } from "vitest"

import HomePage from "./page"

describe("HomePage", () => {
  it("renders the home page without throwing", () => {
    const element = HomePage()
    expect(element).toBeTruthy()
    expect(element.type).toBe("main")
  })
})
