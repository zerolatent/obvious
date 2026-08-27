import { memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, it } from "vitest"

import {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  parseRateLimitConfig,
  rateLimitCustomRules,
} from "./rate-limit"
import { createAuth, type AuthEnv } from "./server"

describe("parseRateLimitConfig", () => {
  it("applies the documented defaults when nothing is set", () => {
    // NODE_ENV=test under vitest, so `enabled` defaults to false here —
    // asserted separately below.
    expect(parseRateLimitConfig({}).window).toBe(DEFAULT_RATE_LIMIT_WINDOW_SECONDS)
    expect(parseRateLimitConfig({}).max).toBe(DEFAULT_RATE_LIMIT_MAX)
  })

  it("defaults to disabled under NODE_ENV=test so the existing suite is unaffected", () => {
    expect(process.env.NODE_ENV).toBe("test")
    expect(parseRateLimitConfig({}).enabled).toBe(false)
  })

  it("honours an explicit AUTH_RATE_LIMIT_ENABLED even under NODE_ENV=test", () => {
    expect(parseRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: "true" }).enabled).toBe(true)
    expect(parseRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: "false" }).enabled).toBe(false)
  })

  it("parses window and max from the environment", () => {
    const config = parseRateLimitConfig({
      AUTH_RATE_LIMIT_WINDOW_SECONDS: "120",
      AUTH_RATE_LIMIT_MAX: "5",
    })
    expect(config.window).toBe(120)
    expect(config.max).toBe(5)
  })

  it("throws on a non-positive-integer window or max", () => {
    expect(() => parseRateLimitConfig({ AUTH_RATE_LIMIT_MAX: "0" })).toThrowError(
      /AUTH_RATE_LIMIT_MAX/,
    )
    expect(() => parseRateLimitConfig({ AUTH_RATE_LIMIT_MAX: "abc" })).toThrowError(
      /AUTH_RATE_LIMIT_MAX/,
    )
    expect(() =>
      parseRateLimitConfig({ AUTH_RATE_LIMIT_WINDOW_SECONDS: "-1" }),
    ).toThrowError(/AUTH_RATE_LIMIT_WINDOW_SECONDS/)
  })

  it("throws on an unrecognized AUTH_RATE_LIMIT_ENABLED value", () => {
    expect(() => parseRateLimitConfig({ AUTH_RATE_LIMIT_ENABLED: "yes" })).toThrowError(
      /AUTH_RATE_LIMIT_ENABLED/,
    )
  })
})

type CustomRules = NonNullable<ReturnType<typeof rateLimitCustomRules>>

/** Every rule this module produces is a plain object, never `false`/a function. */
function asRule(value: CustomRules[string] | undefined): { window: number; max: number } {
  if (!value || typeof value !== "object") throw new Error("expected a rate limit rule object")
  return value
}

describe("rateLimitCustomRules", () => {
  it("tightens sign-in/sign-up to half the global max, same window", () => {
    const rules = rateLimitCustomRules({ enabled: true, window: 60, max: 10 })
    expect(asRule(rules?.["/sign-in/email"])).toEqual({ window: 60, max: 5 })
    expect(asRule(rules?.["/sign-up/email"])).toEqual({ window: 60, max: 5 })
  })

  it("tightens password-reset endpoints further, over a longer window", () => {
    const rules = rateLimitCustomRules({ enabled: true, window: 60, max: 10 })
    expect(asRule(rules?.["/request-password-reset"])).toEqual({ window: 300, max: 2 })
    expect(asRule(rules?.["/reset-password"])).toEqual({ window: 300, max: 2 })
  })

  it("never produces a zero max even for a global max of 1", () => {
    const rules = rateLimitCustomRules({ enabled: true, window: 60, max: 1 })
    expect(asRule(rules?.["/sign-in/email"]).max).toBeGreaterThanOrEqual(1)
    expect(asRule(rules?.["/request-password-reset"]).max).toBeGreaterThanOrEqual(1)
  })
})

const CREDENTIALS: AuthEnv = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  AUTH_PROVIDERS: "email-password",
}

function buildDb() {
  return { user: [], session: [], account: [], verification: [], passkey: [] }
}

async function signIn(auth: ReturnType<typeof createAuth>["auth"]) {
  return auth.handler(
    new Request("http://localhost:3000/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nobody@example.com", password: "wrong-password" }),
    }),
  )
}

describe("rate limiting (integration)", () => {
  it("trips a 429 on /sign-in/email once the configured threshold is exceeded", async () => {
    // Global max=4 -> the sign-in/sign-up custom rule is max=2 (half of 4).
    const { auth } = createAuth({
      env: {
        ...CREDENTIALS,
        AUTH_RATE_LIMIT_ENABLED: "true",
        AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
        AUTH_RATE_LIMIT_MAX: "4",
      },
      database: memoryAdapter(buildDb()),
    })

    const first = await signIn(auth)
    const second = await signIn(auth)
    const third = await signIn(auth)

    // Both requests within budget fail authentication (wrong password), not
    // the rate limiter — proves the limiter isn't just rejecting everything.
    expect(first.status).not.toBe(429)
    expect(second.status).not.toBe(429)
    // The third request exceeds the 2-request budget for this path.
    expect(third.status).toBe(429)
  })

  it("never trips when AUTH_RATE_LIMIT_ENABLED is left at its test default", async () => {
    const { auth } = createAuth({
      env: { ...CREDENTIALS, AUTH_RATE_LIMIT_MAX: "1" },
      database: memoryAdapter(buildDb()),
    })

    const responses = await Promise.all([signIn(auth), signIn(auth), signIn(auth), signIn(auth)])
    for (const response of responses) {
      expect(response.status).not.toBe(429)
    }
  })

  it("logs a warn through the injected logger when the limit trips", async () => {
    const warnCalls: [string, Record<string, unknown> | undefined][] = []
    const logger = {
      debug: () => {},
      info: () => {},
      warn: (message: string, meta?: Record<string, unknown>) => warnCalls.push([message, meta]),
      error: () => {},
    }
    const { auth } = createAuth({
      env: {
        ...CREDENTIALS,
        AUTH_RATE_LIMIT_ENABLED: "true",
        AUTH_RATE_LIMIT_WINDOW_SECONDS: "60",
        AUTH_RATE_LIMIT_MAX: "2",
      },
      database: memoryAdapter(buildDb()),
      logger,
    })

    await signIn(auth)
    await signIn(auth)

    const rateLimitWarnings = warnCalls.filter(([message]) => message === "Rate limit exceeded")
    expect(rateLimitWarnings.length).toBeGreaterThan(0)
  })
})
