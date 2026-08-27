import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, it } from "vitest"

import { authMethodsResponse, type ProviderId } from "./config"
import {
  createAuth,
  DEFAULT_MOBILE_APP_SCHEME,
  mobileTrustedOrigins,
  mountedRoutes,
  type AuthEnv,
} from "./server"

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

  it("always mounts the expo authorization proxy", () => {
    // The Expo client routes its OAuth authorization through this endpoint;
    // like bearer, it is a client platform's needs, not a login method.
    expect(routes).toContain("/expo-authorization-proxy")
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

describe("mobileTrustedOrigins", () => {
  it("trusts the app scheme by default", () => {
    expect(mobileTrustedOrigins({})).toEqual([`${DEFAULT_MOBILE_APP_SCHEME}://`])
  })

  it("defaults to the scheme apps/mobile actually registers with the OS", () => {
    // The server trusting a scheme the app does not register is invisible
    // until a real device completes an OAuth hop, so pin them together here.
    const manifestPath = path.resolve(
      path.dirname(fileURLToPath(import.meta.url)),
      "../../../apps/mobile/app.json",
    )
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      expo: { scheme: string }
    }
    expect(DEFAULT_MOBILE_APP_SCHEME).toBe(manifest.expo.scheme)
  })

  it("honours MOBILE_APP_SCHEME and normalises how it is written", () => {
    expect(mobileTrustedOrigins({ MOBILE_APP_SCHEME: "other-app" })).toEqual(["other-app://"])
    expect(mobileTrustedOrigins({ MOBILE_APP_SCHEME: "Other-App://" })).toEqual(["other-app://"])
    expect(mobileTrustedOrigins({ MOBILE_APP_SCHEME: " other-app: " })).toEqual(["other-app://"])
  })

  it("rejects a value that is not a URL scheme", () => {
    // Silently accepting this would produce an origin that matches nothing.
    expect(() => mobileTrustedOrigins({ MOBILE_APP_SCHEME: "https://example.com" })).toThrowError(
      /MOBILE_APP_SCHEME/,
    )
    expect(() => mobileTrustedOrigins({ MOBILE_APP_SCHEME: "9lives" })).toThrowError(
      /MOBILE_APP_SCHEME/,
    )
    expect(() => mobileTrustedOrigins({ MOBILE_APP_SCHEME: "" })).toThrowError(/MOBILE_APP_SCHEME/)
  })
})

/**
 * Better Auth sets `skipOriginCheck` when NODE_ENV=test, so a suite that just
 * posts a callbackURL proves nothing about origin trust — which is how the
 * missing app-scheme origin passed CI and still broke a real device. These
 * tests turn the check back on and drive the middleware for real.
 */
function buildAuthEnforcingOrigins(env: Partial<AuthEnv> = {}) {
  return createAuth({
    env: { ...CREDENTIALS, AUTH_PROVIDERS: "google,apple", ...env },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
    advanced: { disableOriginCheck: false },
  })
}

describe("mobile OAuth deep-link callback", () => {
  const { auth } = buildAuthEnforcingOrigins()

  it.each([`${DEFAULT_MOBILE_APP_SCHEME}://`, `${DEFAULT_MOBILE_APP_SCHEME}://signed-in`])(
    "accepts %s as the social callback",
    async (callbackURL) => {
      const response = await callAuth(auth, "/sign-in/social", { provider: "google", callbackURL })
      expect(response.status).toBe(200)
      expect(response.body.url).toContain("http")
    },
  )

  it("refuses a scheme this deployment does not own", async () => {
    const response = await callAuth(auth, "/sign-in/social", {
      provider: "google",
      callbackURL: "evil-app://steal",
    })
    expect(response.status).toBe(403)
    expect(response.body.code).toBe("INVALID_CALLBACK_URL")
  })

  it("keeps the web app's own origin trusted", async () => {
    const context = await auth.$context
    expect(context.isTrustedOrigin("http://localhost:3000")).toBe(true)
    expect(context.isTrustedOrigin(`${DEFAULT_MOBILE_APP_SCHEME}://signed-in`)).toBe(true)
    expect(context.isTrustedOrigin("evil-app://steal")).toBe(false)
  })

  it("follows MOBILE_APP_SCHEME when a deployment overrides it", async () => {
    const { auth: renamed } = buildAuthEnforcingOrigins({ MOBILE_APP_SCHEME: "other-app" })

    const accepted = await callAuth(renamed, "/sign-in/social", {
      provider: "google",
      callbackURL: "other-app://",
    })
    expect(accepted.status).toBe(200)

    const refused = await callAuth(renamed, "/sign-in/social", {
      provider: "google",
      callbackURL: `${DEFAULT_MOBILE_APP_SCHEME}://`,
    })
    expect(refused.status).toBe(403)
    expect(refused.body.code).toBe("INVALID_CALLBACK_URL")
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
