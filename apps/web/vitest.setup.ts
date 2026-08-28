import { cleanup } from "@testing-library/react"
import { afterEach } from "vitest"

import "@testing-library/jest-dom/vitest"

// jsdom's realm replaces the global Uint8Array, while TextEncoder stays
// Node's — so the secret bytes Better Auth hands to jose when it signs an
// email-verification token (HS256 JWT) fail jose's `instanceof Uint8Array`
// check as cross-realm objects, and every signup with
// AUTH_REQUIRE_EMAIL_VERIFICATION on 500s. Point the global back at Node's
// Uint8Array: nothing in the DOM tests cares which realm it comes from, but
// jose's check does. (Reset flows don't hit this — their token is random
// bytes, not a JWT — which is why only the verification tests surfaced it.)
const nodeUint8Array = new TextEncoder().encode("").constructor as unknown as typeof Uint8Array
globalThis.Uint8Array = nodeUint8Array

// Global tests (not vitest's `globals: true`) — cleanup must be wired
// explicitly or React Testing Library leaves mounted trees between tests.
afterEach(() => {
  cleanup()
})
