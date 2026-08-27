import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The wiring test for the web app: the mounted auth server and the advertised
 * method list must agree, and both must follow AUTH_PROVIDERS.
 *
 * Only rejection paths touch the network here — a successful social sign-in
 * persists OAuth state, and the database round trip belongs to @app/db's
 * migration test, not to route wiring. Success paths are covered in
 * packages/auth against an in-memory adapter.
 */

const ORIGINAL_ENV = { ...process.env }

async function loadRoutes(providers: string) {
  vi.resetModules()
  Object.assign(process.env, {
    AUTH_PROVIDERS: providers,
    BETTER_AUTH_URL: "http://localhost:3000",
    BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
    DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:5432/unused",
    GOOGLE_CLIENT_ID: "google-client-id",
    GOOGLE_CLIENT_SECRET: "google-client-secret",
    APPLE_CLIENT_ID: "apple-client-id",
    APPLE_CLIENT_SECRET: "apple-client-secret",
    APPLE_BUNDLE_ID: "com.example.app",
  })

  const methods = await import("./route")
  const auth = await import("../auth/[...all]/route")
  return { methods, auth }
}

function authRequest(path: string, body?: Record<string, unknown>) {
  return new Request(`http://localhost:3000/api/auth${path}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  })
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("GET /api/auth-methods", () => {
  it("returns exactly the configured methods", async () => {
    const { methods } = await loadRoutes("email-password,google")
    const response = methods.GET()

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      methods: ["email-password", "google"],
    })
  })

  it("reflects a different deployment's configuration", async () => {
    const { methods } = await loadRoutes("passkey,apple")
    await expect(methods.GET().json()).resolves.toEqual({ methods: ["apple", "passkey"] })
  })
})

describe("/api/auth/[...all]", () => {
  it("serves the mounted auth server", async () => {
    const { auth } = await loadRoutes("email-password")
    const response = await auth.GET(authRequest("/ok"))
    expect(response.status).toBe(200)
  })

  it("rejects a method the deployment did not enable", async () => {
    const { auth, methods } = await loadRoutes("google")

    await expect(methods.GET().json()).resolves.toEqual({ methods: ["google"] })

    const emailSignUp = await auth.POST(
      authRequest("/sign-up/email", {
        email: "user@example.com",
        password: "correct-horse-battery-staple",
        name: "Test User",
      }),
    )
    expect(emailSignUp.status).toBe(400)

    const appleSignIn = await auth.POST(
      authRequest("/sign-in/social", { provider: "apple", callbackURL: "/" }),
    )
    expect(appleSignIn.status).toBe(404)
  })

  it("does not mount passkey routes when passkey is disabled", async () => {
    const { auth } = await loadRoutes("email-password")
    const response = await auth.GET(authRequest("/passkey/generate-register-options"))
    expect(response.status).toBe(404)
  })
})
