import { memoryAdapter } from "better-auth/adapters/memory"
import { generateKeyPair, SignJWT } from "jose"
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"

import { createAuth, type AuthEnv } from "./server"

/**
 * Mocked OAuth integration tests: drive the real authorization-code
 * callback through Better Auth's HTTP handler with `fetch` stubbed for the
 * provider token endpoints.
 *
 * Signature verification is deliberately NOT part of this mock: reading
 * Better Auth 1.7's `getUserInfo` for google/apple (and confirming no
 * `verifyProviderIdToken` call sits in the authorization-code callback path,
 * only in the separate client-submitted id-token sign-in route) shows the
 * code-exchange flow trusts the `id_token` returned by the token endpoint at
 * face value — it decodes the claims without re-checking the signature,
 * because the token endpoint response is already a server-to-server call
 * authenticated by the client secret over TLS. So a self-signed JWT with any
 * key stands in correctly for a real provider response here; a JWKS mock
 * would be exercising a code path these tests don't take.
 */

const CREDENTIALS: AuthEnv = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  AUTH_PROVIDERS: "google,apple",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  APPLE_CLIENT_ID: "apple-client-id",
  APPLE_CLIENT_SECRET: "apple-client-secret",
  APPLE_BUNDLE_ID: "com.example.app",
}

interface MemoryRow {
  id: string
  [key: string]: unknown
}

interface MemoryDb {
  [key: string]: MemoryRow[]
  user: MemoryRow[]
  session: MemoryRow[]
  account: MemoryRow[]
  verification: MemoryRow[]
  passkey: MemoryRow[]
}

function buildDb(): MemoryDb {
  return { user: [], session: [], account: [], verification: [], passkey: [] }
}

function buildAuth(db: MemoryDb) {
  return createAuth({
    env: CREDENTIALS,
    database: memoryAdapter(db),
    // NODE_ENV=test otherwise skips origin validation entirely, so these
    // callback flows would pass even against a request with no Origin at
    // all. `call()` never sets one, and the suite still passes below
    // because the checks this file exercises (state-bound callback,
    // account linking) don't turn on origin validation the way the
    // deep-link callbackURL check in provider-enablement.test.ts does —
    // pinning the flag here documents that this suite doesn't rely on the
    // test-mode bypass, rather than leaving it an unverified assumption.
    advanced: { disableOriginCheck: false },
  })
}

// One signing key reused across tests: the callback path never checks the
// signature, so the key's only job is to make the token three JWS segments.
let signingKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"]
beforeAll(async () => {
  const { privateKey } = await generateKeyPair("RS256")
  signingKey = privateKey
})

async function signIdToken(claims: Record<string, unknown>): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(signingKey)
}

interface TokenResponse {
  access_token: string
  id_token: string
  token_type: string
  expires_in: number
}

/** Stubs `fetch` for exactly the token endpoints the two providers hit. */
function stubTokenEndpoints(responders: {
  google?: () => TokenResponse
  apple?: () => TokenResponse
}) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : "GET")
    if (method === "POST" && url === "https://oauth2.googleapis.com/token" && responders.google) {
      return jsonResponse(responders.google())
    }
    if (method === "POST" && url === "https://appleid.apple.com/auth/token" && responders.apple) {
      return jsonResponse(responders.apple())
    }
    throw new Error(`Unmocked fetch in OAuth integration test: ${method} ${url}`)
  })
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  })
}

function tokenResponse(idToken: string): TokenResponse {
  return {
    access_token: `access-${idToken.slice(0, 8)}`,
    id_token: idToken,
    token_type: "Bearer",
    expires_in: 3600,
  }
}

/** Reads every `Set-Cookie` header off a Response, portable across runtimes. */
function extractSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] }
  if (typeof headers.getSetCookie === "function") return headers.getSetCookie()
  const raw = response.headers.get("set-cookie")
  return raw ? [raw] : []
}

function cookieHeader(cookies: string[]): string {
  return cookies.map((entry) => entry.split(";")[0]).join("; ")
}

async function call(
  auth: ReturnType<typeof buildAuth>["auth"],
  path: string,
  init: { method?: string; body?: Record<string, unknown>; cookie?: string } = {},
): Promise<Response> {
  return auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: {
        "content-type": "application/json",
        ...(init.cookie ? { cookie: init.cookie } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    }),
  )
}

/** Starts a social sign-in and returns the CSRF `state` plus its cookie jar. */
async function beginSocialSignIn(
  auth: ReturnType<typeof buildAuth>["auth"],
  provider: "google" | "apple",
): Promise<{ state: string; cookie: string }> {
  const response = await call(auth, "/sign-in/social", {
    body: { provider, callbackURL: "/" },
  })
  expect(response.status).toBe(200)
  const body = (await response.json()) as { url: string }
  const state = new URL(body.url).searchParams.get("state")
  if (!state) throw new Error("sign-in/social response did not carry a state parameter")
  return { state, cookie: cookieHeader(extractSetCookies(response)) }
}

async function completeCallback(
  auth: ReturnType<typeof buildAuth>["auth"],
  provider: "google" | "apple",
  begin: { state: string; cookie: string },
  outcome: { code: string } | { error: string; errorDescription: string },
): Promise<Response> {
  const query = new URLSearchParams({ state: begin.state })
  if ("code" in outcome) {
    query.set("code", outcome.code)
  } else {
    query.set("error", outcome.error)
    query.set("error_description", outcome.errorDescription)
  }
  return call(auth, `/callback/${provider}?${query.toString()}`, { cookie: begin.cookie })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe("google sign-in: account creation", () => {
  it("creates one user and one linked account from a fresh Google login", async () => {
    const db = buildDb()
    const { auth } = buildAuth(db)

    const idToken = await signIdToken({
      iss: "https://accounts.google.com",
      aud: CREDENTIALS.GOOGLE_CLIENT_ID,
      sub: "google-sub-1",
      email: "new.user@example.com",
      email_verified: true,
      name: "New User",
    })
    stubTokenEndpoints({ google: () => tokenResponse(idToken) })

    const begin = await beginSocialSignIn(auth, "google")
    const response = await completeCallback(auth, "google", begin, { code: "google-auth-code" })

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    expect(extractSetCookies(response).length).toBeGreaterThan(0)

    expect(db.user).toHaveLength(1)
    expect(db.user[0]?.email).toBe("new.user@example.com")
    expect(db.user[0]?.emailVerified).toBe(true)

    expect(db.account).toHaveLength(1)
    expect(db.account[0]?.providerId).toBe("google")
    expect(db.account[0]?.userId).toBe(db.user[0]?.id)
  })
})

describe("cross-provider account linking", () => {
  it("resolves a Google login and an Apple login on the same verified email to one user", async () => {
    const db = buildDb()
    const { auth } = buildAuth(db)
    const sharedEmail = "shared@example.com"

    const googleIdToken = await signIdToken({
      iss: "https://accounts.google.com",
      aud: CREDENTIALS.GOOGLE_CLIENT_ID,
      sub: "google-sub-shared",
      email: sharedEmail,
      email_verified: true,
      name: "Shared User",
    })
    stubTokenEndpoints({ google: () => tokenResponse(googleIdToken) })
    const googleBegin = await beginSocialSignIn(auth, "google")
    const googleResponse = await completeCallback(auth, "google", googleBegin, {
      code: "google-auth-code",
    })
    expect(googleResponse.status).toBeGreaterThanOrEqual(300)
    expect(googleResponse.status).toBeLessThan(400)
    expect(db.user).toHaveLength(1)
    const userId = db.user[0]?.id

    // Fresh mock for the second provider — a distinct spy per call, restored
    // in afterEach, so this reflects only the Apple exchange.
    vi.restoreAllMocks()
    const appleIdToken = await signIdToken({
      iss: "https://appleid.apple.com",
      aud: CREDENTIALS.APPLE_CLIENT_ID,
      sub: "apple-sub-shared",
      email: sharedEmail,
      email_verified: true,
      name: "Shared User",
    })
    stubTokenEndpoints({ apple: () => tokenResponse(appleIdToken) })
    const appleBegin = await beginSocialSignIn(auth, "apple")
    const appleResponse = await completeCallback(auth, "apple", appleBegin, {
      code: "apple-auth-code",
    })
    expect(appleResponse.status).toBeGreaterThanOrEqual(300)
    expect(appleResponse.status).toBeLessThan(400)

    // The spec's core assertion: still exactly one user, now with two linked
    // provider accounts, not a silent duplicate.
    expect(db.user).toHaveLength(1)
    expect(db.user[0]?.id).toBe(userId)
    expect(db.account).toHaveLength(2)
    const providerIds = db.account.map((account) => account.providerId).sort()
    expect(providerIds).toEqual(["apple", "google"])
    for (const account of db.account) {
      expect(account.userId).toBe(userId)
    }
  })

  it("does not link accounts across different, unrelated emails", async () => {
    const db = buildDb()
    const { auth } = buildAuth(db)

    const googleIdToken = await signIdToken({
      iss: "https://accounts.google.com",
      aud: CREDENTIALS.GOOGLE_CLIENT_ID,
      sub: "google-sub-a",
      email: "person-a@example.com",
      email_verified: true,
      name: "Person A",
    })
    stubTokenEndpoints({ google: () => tokenResponse(googleIdToken) })
    const googleBegin = await beginSocialSignIn(auth, "google")
    await completeCallback(auth, "google", googleBegin, { code: "google-auth-code" })
    expect(db.user).toHaveLength(1)

    vi.restoreAllMocks()
    const appleIdToken = await signIdToken({
      iss: "https://appleid.apple.com",
      aud: CREDENTIALS.APPLE_CLIENT_ID,
      sub: "apple-sub-b",
      email: "person-b@example.com",
      email_verified: true,
      name: "Person B",
    })
    stubTokenEndpoints({ apple: () => tokenResponse(appleIdToken) })
    const appleBegin = await beginSocialSignIn(auth, "apple")
    await completeCallback(auth, "apple", appleBegin, { code: "apple-auth-code" })

    // Two unrelated emails must produce two independent users — proof the
    // linking policy keys on the verified email, not on providers alone.
    expect(db.user).toHaveLength(2)
    expect(db.account).toHaveLength(2)
  })
})

describe("user-cancelled consent", () => {
  it("does not create a user or account when the provider reports the user denied consent", async () => {
    const db = buildDb()
    const { auth } = buildAuth(db)

    const begin = await beginSocialSignIn(auth, "google")
    const response = await completeCallback(auth, "google", begin, {
      error: "access_denied",
      errorDescription: "The user cancelled the consent screen",
    })

    expect(response.status).toBeGreaterThanOrEqual(300)
    expect(response.status).toBeLessThan(400)
    const location = response.headers.get("location") ?? ""
    expect(location).toContain("error=access_denied")

    expect(db.user).toHaveLength(0)
    expect(db.account).toHaveLength(0)
  })
})
