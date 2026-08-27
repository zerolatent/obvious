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
 * A `fetch` replacement that stands in for the browser: it answers
 * GET /api/auth-methods itself, routes everything under /api/auth to the
 * real Better Auth handler, and — since there is no browser to do it for
 * us — carries the `Set-Cookie` session cookie from each response onto the
 * next request. This is what lets a signup call's session persist into a
 * later `useSession()` read within the same test.
 */
export function createTestAuthFetch(providers: string) {
  const { auth, registry } = buildTestAuth(providers)
  let cookie: string | null = null

  const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input.toString() : input.url,
      "http://localhost:3000",
    )

    if (url.pathname === "/api/auth-methods") {
      return Response.json(authMethodsResponse(registry))
    }

    const headers = new Headers(init?.headers)
    if (cookie) headers.set("cookie", cookie)

    const response = await auth.handler(
      new Request(url, {
        method: init?.method ?? "GET",
        headers,
        body: init?.body as BodyInit | null | undefined,
      }),
    )

    const setCookie = response.headers.getSetCookie?.() ?? []
    if (setCookie.length > 0) {
      cookie = setCookie.map((entry) => entry.split(";")[0]).join("; ")
    }

    return response
  }

  return { fetch: fetchImpl, auth, registry }
}
