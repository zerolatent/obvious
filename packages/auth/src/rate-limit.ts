import type { BetterAuthOptions } from "better-auth"

/** Applied when AUTH_RATE_LIMIT_WINDOW_SECONDS is unset. */
export const DEFAULT_RATE_LIMIT_WINDOW_SECONDS = 60
/** Applied when AUTH_RATE_LIMIT_MAX is unset. */
export const DEFAULT_RATE_LIMIT_MAX = 10

/**
 * The stricter per-path rules layered over the global window/max, expressed
 * as divisors/multipliers of the configured global rule (not hardcoded
 * numbers) so tightening AUTH_RATE_LIMIT_MAX tightens these too. These are
 * the endpoints an attacker actually wants to hammer: credential guessing
 * (sign-in), account-creation spam (sign-up), and reset-email bombing (both
 * legs of password reset).
 */
const SIGN_IN_UP_MAX_DIVISOR = 2
const PASSWORD_RESET_MAX_DIVISOR = 4
const PASSWORD_RESET_WINDOW_MULTIPLIER = 5

export interface RateLimitConfig {
  readonly enabled: boolean
  readonly window: number
  readonly max: number
}

interface RateLimitEnv {
  AUTH_RATE_LIMIT_ENABLED?: string | undefined
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string | undefined
  AUTH_RATE_LIMIT_MAX?: string | undefined
}

function parseBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
  if (raw === undefined || raw.trim().length === 0) return fallback
  const normalized = raw.trim().toLowerCase()
  if (normalized === "true" || normalized === "1") return true
  if (normalized === "false" || normalized === "0") return false
  throw new Error(`${name} must be "true" or "false", got "${raw}".`)
}

function parsePositiveInt(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim().length === 0) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer, got "${raw}".`)
  }
  return value
}

/**
 * Vitest sets NODE_ENV=test; rate limiting defaults off there so the existing
 * suite's repeated sign-in/sign-up calls don't start tripping 429s that have
 * nothing to do with what a given test is checking. A suite that wants to
 * exercise the limiter opts in explicitly via AUTH_RATE_LIMIT_ENABLED. This
 * mirrors Better Auth's own origin-check test-mode default (see
 * provider-enablement.test.ts's "mobile OAuth deep-link callback" suite).
 */
function defaultEnabledForRuntime(): boolean {
  return process.env.NODE_ENV !== "test"
}

export function parseRateLimitConfig(env: RateLimitEnv): RateLimitConfig {
  return {
    enabled: parseBoolean(
      env.AUTH_RATE_LIMIT_ENABLED,
      defaultEnabledForRuntime(),
      "AUTH_RATE_LIMIT_ENABLED",
    ),
    window: parsePositiveInt(
      env.AUTH_RATE_LIMIT_WINDOW_SECONDS,
      DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
      "AUTH_RATE_LIMIT_WINDOW_SECONDS",
    ),
    max: parsePositiveInt(env.AUTH_RATE_LIMIT_MAX, DEFAULT_RATE_LIMIT_MAX, "AUTH_RATE_LIMIT_MAX"),
  }
}

/**
 * Better Auth already special-cases `/sign-in/*` and `/sign-up/*` with a
 * fixed internal default; naming the rule explicitly here — rather than
 * relying on that built-in — keeps the actual numbers visible in this
 * repo's diff, tied to our configured global rule, and extends the same
 * tighter budget to the password-reset endpoints Better Auth's built-in
 * special-casing doesn't reach.
 */
export function rateLimitCustomRules(
  config: RateLimitConfig,
): NonNullable<BetterAuthOptions["rateLimit"]>["customRules"] {
  const signInUpMax = Math.max(1, Math.floor(config.max / SIGN_IN_UP_MAX_DIVISOR))
  const passwordResetMax = Math.max(1, Math.floor(config.max / PASSWORD_RESET_MAX_DIVISOR))
  const passwordResetWindow = config.window * PASSWORD_RESET_WINDOW_MULTIPLIER

  return {
    "/sign-in/email": { window: config.window, max: signInUpMax },
    "/sign-up/email": { window: config.window, max: signInUpMax },
    "/request-password-reset": { window: passwordResetWindow, max: passwordResetMax },
    "/reset-password": { window: passwordResetWindow, max: passwordResetMax },
  }
}

/** Assembles the `rateLimit` fragment passed straight to `betterAuth()`. */
export function rateLimitOptionsFor(config: RateLimitConfig): BetterAuthOptions["rateLimit"] {
  return {
    enabled: config.enabled,
    window: config.window,
    max: config.max,
    customRules: rateLimitCustomRules(config),
  }
}
