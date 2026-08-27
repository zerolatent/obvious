import { memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, it } from "vitest"

import { authMethodsResponse, type ProviderId } from "./config"
import { createAuth, mountedRoutes, type AuthEnv } from "./server"

/**
 * The invariant this file exists for: what AUTH_PROVIDERS says is exactly what
 * the server mounts, exactly what /api/auth-methods advertises, and exactly
 * what the API accepts. Anything else is a deployment lying to its clients.
 */

const CREDENTIALS: AuthEnv = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  GOOGLE_CLIENT_ID: "google-client-id",
  GOOGLE_CLIENT_SECRET: "google-client-secret",
  APPLE_CLIENT_ID: "apple-client-id",
  APPLE_CLIENT_SECRET: "apple-client-secret",
  APPLE_BUNDLE_ID: "com.example.app",
}

/** Every passkey route the plugin contributes when it is mounted. */
const PASSKEY_ROUTES = [
  "/passkey/delete-passkey",
  "/passkey/generate-authenticate-options",
  "/passkey/generate-register-options",
  "/passkey/list-user-passkeys",
  "/passkey/update-passkey",
  "/passkey/verify-authentication",
  "/passkey/verify-registration",
]

function buildAuth(providers: string) {
  return createAuth({
    env: { ...CREDENTIALS, AUTH_PROVIDERS: providers },
    // In-memory tables: this suite is about which capabilities are mounted,
    // not about persistence. The Postgres path is covered by @app/db's
    // migration test and by the schema-parity test in this package.
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
  })
}

async function callAuth(
  auth: ReturnType<typeof buildAuth>["auth"],
  path: string,
  body?: Record<string, unknown>,
) {
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  const text = await response.text()
  return {
    status: response.status,
    body: text.length > 0 ? (JSON.parse(text) as { code?: string; url?: string }) : {},
  }
}

const SUBSETS: { providers: string; expected: ProviderId[] }[] = [
  { providers: "email-password", expected: ["email-password"] },
  { providers: "google", expected: ["google"] },
  { providers: "passkey", expected: ["passkey"] },
  { providers: "email-password,passkey", expected: ["email-password", "passkey"] },
  { providers: "google,apple", expected: ["google", "apple"] },
  {
    providers: "email-password,google,apple,passkey",
    expected: ["email-password", "google", "apple", "passkey"],
  },
]

describe.each(SUBSETS)("AUTH_PROVIDERS=$providers", ({ providers, expected }) => {
  const { auth, registry } = buildAuth(providers)
  const routes = mountedRoutes(auth)
  const has = (id: ProviderId) => expected.includes(id)

  it("advertises exactly the enabled methods", () => {
    expect(authMethodsResponse(registry)).toEqual({ methods: expected })
  })

  it("mounts passkey routes only when passkey is enabled", () => {
    for (const route of PASSKEY_ROUTES) {
      expect(routes.includes(route), `${route} mounted`).toBe(has("passkey"))
    }
  })

  it("always mounts the session routes the bearer plugin serves", () => {
    // Not provider-gated: mobile and any API client depend on header sessions.
    expect(routes).toContain("/get-session")
    expect(routes).toContain("/sign-out")
  })

  it(`${has("passkey") ? "serves" : "rejects"} passkey registration options`, async () => {
    const response = await callAuth(auth, "/passkey/generate-register-options")
    if (has("passkey")) {
      // Unauthenticated, but the route exists — 401, not 404.
      expect(response.status).not.toBe(404)
    } else {
      expect(response.status).toBe(404)
    }
  })

  it(`${has("email-password") ? "accepts" : "rejects"} email sign-up`, async () => {
    const response = await callAuth(auth, "/sign-up/email", {
      email: `user-${providers.replace(/[^a-z]/g, "")}@example.com`,
      password: "correct-horse-battery-staple",
      name: "Test User",
    })
    if (has("email-password")) {
      expect(response.status).toBe(200)
    } else {
      expect(response.status).toBe(400)
      expect(response.body.code).toBe("EMAIL_PASSWORD_SIGN_UP_DISABLED")
    }
  })

  it(`${has("email-password") ? "accepts" : "rejects"} email sign-in`, async () => {
    const response = await callAuth(auth, "/sign-in/email", {
      email: "nobody@example.com",
      password: "correct-horse-battery-staple",
    })
    if (has("email-password")) {
      // Enabled: the credentials are simply wrong (401), not refused (400).
      expect(response.body.code).not.toBe("EMAIL_PASSWORD_DISABLED")
    } else {
      expect(response.status).toBe(400)
      expect(response.body.code).toBe("EMAIL_PASSWORD_DISABLED")
    }
  })

  it.each(["google", "apple"] as const)("%s social sign-in matches its enabled state", async (provider) => {
    const response = await callAuth(auth, "/sign-in/social", {
      provider,
      callbackURL: "/",
    })
    if (has(provider)) {
      expect(response.status).toBe(200)
      expect(response.body.url).toContain("http")
    } else {
      expect(response.status).toBe(404)
      expect(response.body.code).toBe("PROVIDER_NOT_FOUND")
    }
  })
})

describe("createAuth", () => {
  it("refuses to boot on an unknown provider id", () => {
    expect(() => buildAuth("email-password,myspace")).toThrowError(/myspace/)
  })

  it("refuses to boot when an enabled social provider has no credentials", () => {
    expect(() =>
      createAuth({
        env: { AUTH_PROVIDERS: "google", BETTER_AUTH_SECRET: CREDENTIALS.BETTER_AUTH_SECRET },
        database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
      }),
    ).toThrowError(/GOOGLE_CLIENT_ID/)
  })

  it("refuses to boot when apple is enabled but APPLE_BUNDLE_ID is missing", () => {
    expect(() =>
      createAuth({
        env: {
          AUTH_PROVIDERS: "apple",
          BETTER_AUTH_SECRET: CREDENTIALS.BETTER_AUTH_SECRET,
          APPLE_CLIENT_ID: CREDENTIALS.APPLE_CLIENT_ID,
          APPLE_CLIENT_SECRET: CREDENTIALS.APPLE_CLIENT_SECRET,
        },
        database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
      }),
    ).toThrowError(/APPLE_BUNDLE_ID/)
  })

  it("defaults to email-password when AUTH_PROVIDERS is unset", () => {
    const { registry } = createAuth({
      env: { ...CREDENTIALS, AUTH_PROVIDERS: undefined },
      database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
    })
    expect(registry.enabled).toEqual(["email-password"])
  })
})
