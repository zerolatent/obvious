import { describe, expect, it } from "vitest"

import {
  detectOAuthCallbackRejection,
  detectRateLimitHit,
  sanitizeAuthPath,
  withRequestLogging,
} from "./request-events"

describe("sanitizeAuthPath", () => {
  it("passes ordinary paths through unchanged", () => {
    expect(sanitizeAuthPath("/sign-in/email")).toBe("/sign-in/email")
    expect(sanitizeAuthPath("/callback/google")).toBe("/callback/google")
  })

  it("redacts a reset-password token so it never reaches a log line", () => {
    expect(sanitizeAuthPath("/api/auth/reset-password/eyJhbGciOiJSUzI1NiJ9")).toBe(
      "/api/auth/reset-password/:token",
    )
  })
})

describe("detectRateLimitHit", () => {
  it("returns null for a non-429 response", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST" })
    const response = new Response(null, { status: 200 })
    expect(detectRateLimitHit(request, response)).toBeNull()
  })

  it("extracts path, method, and retry-after on a 429", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST" })
    const response = new Response(null, { status: 429, headers: { "X-Retry-After": "42" } })
    expect(detectRateLimitHit(request, response)).toEqual({
      path: "/api/auth/sign-in/email",
      method: "POST",
      retryAfterSeconds: 42,
    })
  })

  it("redacts a token embedded in the rate-limited path", () => {
    const request = new Request("http://localhost:3000/api/auth/reset-password/secret-token", {
      method: "POST",
    })
    const response = new Response(null, { status: 429 })
    expect(detectRateLimitHit(request, response)?.path).toBe("/api/auth/reset-password/:token")
  })

  it("reports a null retry-after when the header is absent", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST" })
    const response = new Response(null, { status: 429 })
    expect(detectRateLimitHit(request, response)?.retryAfterSeconds).toBeNull()
  })
})

describe("detectOAuthCallbackRejection", () => {
  it("returns null for a non-callback path", () => {
    const request = new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST" })
    const response = new Response(null, { status: 302, headers: { location: "/error?error=x" } })
    expect(detectOAuthCallbackRejection(request, response)).toBeNull()
  })

  it("returns null when the callback succeeds (no error in the redirect)", () => {
    const request = new Request("http://localhost:3000/api/auth/callback/google")
    const response = new Response(null, { status: 302, headers: { location: "/dashboard" } })
    expect(detectOAuthCallbackRejection(request, response)).toBeNull()
  })

  it("returns null for a non-redirect response", () => {
    const request = new Request("http://localhost:3000/api/auth/callback/google")
    const response = new Response(null, { status: 200 })
    expect(detectOAuthCallbackRejection(request, response)).toBeNull()
  })

  it("extracts the provider and error code from a rejected callback redirect", () => {
    const request = new Request("http://localhost:3000/api/auth/callback/google?state=abc")
    const response = new Response(null, {
      status: 302,
      headers: { location: "http://localhost:3000/error?error=access_denied" },
    })
    expect(detectOAuthCallbackRejection(request, response)).toEqual({
      provider: "google",
      errorCode: "access_denied",
    })
  })

  it("resolves a relative Location header against the request URL", () => {
    const request = new Request("http://localhost:3000/api/auth/callback/apple")
    const response = new Response(null, {
      status: 302,
      headers: { location: "/error?error=state_not_found" },
    })
    expect(detectOAuthCallbackRejection(request, response)).toEqual({
      provider: "apple",
      errorCode: "state_not_found",
    })
  })
})

describe("withRequestLogging", () => {
  it("logs a warn on a rate-limit hit and returns the original response untouched", async () => {
    const warnCalls: [string, Record<string, unknown> | undefined][] = []
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string, meta?: Record<string, unknown>) => warnCalls.push([message, meta]),
      error: () => {},
    }
    const response = new Response("throttled", { status: 429 })
    const handler = withRequestLogging(async () => response, logger)

    const result = await handler(new Request("http://localhost:3000/api/auth/sign-in/email", { method: "POST" }))

    expect(result).toBe(response)
    expect(warnCalls).toHaveLength(1)
    expect(warnCalls[0]?.[0]).toBe("Rate limit exceeded")
  })

  it("logs a warn on a rejected OAuth callback", async () => {
    const warnCalls: [string, Record<string, unknown> | undefined][] = []
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string, meta?: Record<string, unknown>) => warnCalls.push([message, meta]),
      error: () => {},
    }
    const response = new Response(null, {
      status: 302,
      headers: { location: "/error?error=access_denied" },
    })
    const handler = withRequestLogging(async () => response, logger)

    await handler(new Request("http://localhost:3000/api/auth/callback/google"))

    expect(warnCalls).toHaveLength(1)
    expect(warnCalls[0]).toEqual([
      "OAuth callback rejected",
      { provider: "google", errorCode: "access_denied" },
    ])
  })

  it("logs nothing for an ordinary successful response", async () => {
    const warnCalls: unknown[] = []
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (...args: unknown[]) => warnCalls.push(args),
      error: () => {},
    }
    const handler = withRequestLogging(async () => new Response(null, { status: 200 }), logger)

    await handler(new Request("http://localhost:3000/api/auth/get-session"))

    expect(warnCalls).toHaveLength(0)
  })
})
