import { createAuth, authMethodsResponse, type AuthEnv } from "@app/auth"
import { memoryAdapter } from "better-auth/adapters/memory"

/**
 * A real Better Auth instance backed by an in-memory table set — no
 * database, no network, but the actual sign-up/sign-in/sign-out/session
 * logic the production server runs. Mirrors the pattern in
 * packages/auth/src/provider-enablement.test.ts.
 */
const CREDENTIALS: AuthEnv = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
}

function buildTestAuth(providers: string) {
  return createAuth({
    env: { ...CREDENTIALS, AUTH_PROVIDERS: providers },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
  })
}

/**
 * Applies a batch of `Set-Cookie` response headers onto a cookie jar keyed
 * by cookie name, honoring deletions (`Max-Age=0` or an `Expires` in the
 * past). A real browser's cookie store merges by name the same way — a
 * response that sets one cookie never clears the others.
 */
function applySetCookies(jar: Map<string, string>, setCookie: string[]): void {
  for (const entry of setCookie) {
    const [pair = "", ...attributes] = entry.split(";")
    const separatorIndex = pair.indexOf("=")
    if (separatorIndex === -1) continue
    const name = pair.slice(0, separatorIndex).trim()
    const value = pair.slice(separatorIndex + 1).trim()

    const trimmedAttributes = attributes.map((attr) => attr.trim())
    const maxAge = trimmedAttributes.find((attr) => attr.toLowerCase().startsWith("max-age="))
    const expires = trimmedAttributes.find((attr) => attr.toLowerCase().startsWith("expires="))
    const isDeleted =
      (maxAge !== undefined && Number(maxAge.slice("max-age=".length)) <= 0) ||
      (expires !== undefined && new Date(expires.slice("expires=".length)).getTime() <= Date.now())

    if (isDeleted) jar.delete(name)
    else jar.set(name, value)
  }
}

/**
 * A `fetch` replacement that stands in for the browser: it answers
 * GET /api/auth-methods itself, routes everything under /api/auth to the
 * real Better Auth handler, and — since there is no browser to do it for
 * us — maintains a cookie jar across requests the way a browser would.
 *
 * This has to be a real per-name jar, not "last response's Set-Cookie wins":
 * the passkey registration flow sets a *second*, independent challenge
 * cookie on `/passkey/generate-register-options` without re-sending the
 * session cookie, so overwriting the jar on that response would silently
 * drop the session and turn the next request unauthenticated.
 */
export function createTestAuthFetch(providers: string) {
  const { auth, registry } = buildTestAuth(providers)
  const cookieJar = new Map<string, string>()

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input.toString() : input.url,
      "http://localhost:3000",
    )

    if (url.pathname === "/api/auth-methods") {
      return Response.json(authMethodsResponse(registry))
    }

    const headers = new Headers(init?.headers)
    if (cookieJar.size > 0) {
      headers.set(
        "cookie",
        [...cookieJar.entries()].map(([name, value]) => `${name}=${value}`).join("; "),
      )
    }
    // A real browser fetch always carries an Origin header (same-origin
    // included); Better Auth's passkey endpoints read it to validate the
    // WebAuthn ceremony's expected origin and 400 without one. This stub
    // fetch has no browser underneath to add it, so it stands in for one.
    if (!headers.has("origin")) headers.set("origin", "http://localhost:3000")

    const response = await auth.handler(
      new Request(url, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body as BodyInit | null | undefined,
      }),
    )

    applySetCookies(cookieJar, response.headers.getSetCookie?.() ?? [])

    return response
  }

  return { fetch: fetchImpl, auth, registry }
}
