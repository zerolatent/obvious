import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"

// Global tests (not vitest's `globals: true`) — cleanup must be wired
// explicitly or React Testing Library leaves mounted trees between tests.
afterEach(() => {
  cleanup()
})
