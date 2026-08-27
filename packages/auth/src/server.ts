/**
 * WHY `better-auth` IS PINNED TO AN EXACT VERSION (no caret) in
 * packages/auth/package.json — package.json cannot hold comments, so the
 * rationale lives here, next to the import it constrains.
 *
 * This package does not merely call Better Auth's public API; parts of its
 * contract are assertions about 1.7 *internals* that were established by
 * reading the dependency's source, not its documentation:
 *
 *   - `accountLinkingConfig()` below relies on `handleOAuthUserInfo`
 *     auto-linking a new provider to an existing account whenever the
 *     incoming profile reports `emailVerified: true`. `oauth-integration.test.ts`
 *     asserts one user, not two, across a Google + Apple login on one address.
 *   - Those same tests assert that the authorization-code callback trusts the
 *     `id_token` from the token endpoint without re-verifying its signature,
 *     which is why a self-signed JWT is a valid stand-in there.
 *   - `emailAndPasswordConfig()` relies on `/request-password-reset` gating on
 *     the *presence* of `sendResetPassword` rather than on
 *     `emailAndPassword.enabled` — that is what keeps password reset off a
 *     social-only deployment.
 *
 * A caret range lets a patch or minor release change any of that silently, on
 * someone else's `install`, in a security-critical path. Pinned, a bump is a
 * reviewable diff that re-runs those tests on purpose. The `@better-auth/*`
 * plugins keep their carets: this package uses only their documented surface.
 */
import { authSchema, getDb } from "@app/db"
import { expo } from "@better-auth/expo"
import { passkey } from "@better-auth/passkey"
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer } from "better-auth/plugins/bearer"

import {
  createProviderRegistry,
  parseRequireEmailVerification,
  type ProviderRegistry,
} from "./config"
import { wrapEmailDispatch } from "./email-dispatch"
import { createConsoleLogger, parseLogLevel, type AuthLogger } from "./logging"
import {
  createConsoleMailer,
  emailVerificationMail,
  passwordResetMail,
  type Mailer,
} from "./mailer"
import { parseRateLimitConfig, rateLimitOptionsFor } from "./rate-limit"
import { withRequestLogging } from "./request-events"

/**
 * The environment slice auth reads. Passed in rather than read from
 * `process.env` at module scope so a test can build an instance for any
 * provider subset without mutating global state.
 */
export interface AuthEnv {
  AUTH_PROVIDERS?: string | undefined
  AUTH_REQUIRE_EMAIL_VERIFICATION?: string | undefined
  BETTER_AUTH_SECRET?: string | undefined
  BETTER_AUTH_URL?: string | undefined
  GOOGLE_CLIENT_ID?: string | undefined
  GOOGLE_CLIENT_SECRET?: string | undefined
  APPLE_CLIENT_ID?: string | undefined
  APPLE_CLIENT_SECRET?: string | undefined
  APPLE_BUNDLE_ID?: string | undefined
  MOBILE_APP_SCHEME?: string | undefined
  /** Verbosity of the default console logger. Defaults to "warn". */
  AUTH_LOG_LEVEL?: string | undefined
  /** Defaults to enabled outside of NODE_ENV=test. */
  AUTH_RATE_LIMIT_ENABLED?: string | undefined
  /** Defaults to 60. */
  AUTH_RATE_LIMIT_WINDOW_SECONDS?: string | undefined
  /** Defaults to 10. */
  AUTH_RATE_LIMIT_MAX?: string | undefined
}

/** The scheme apps/mobile registers with the OS (app.json `expo.scheme`). */
export const DEFAULT_MOBILE_APP_SCHEME = "obvious-auth"

// RFC 3986 scheme grammar, lower-cased: a bad value here would silently
// produce an origin that matches nothing, so it is rejected at boot instead.
const SCHEME_PATTERN = /^[a-z][a-z0-9+.-]*$/

/**
 * The app-scheme origin the OAuth deep-link callback returns through.
 *
 * Better Auth validates `callbackURL` against `trustedOrigins` and answers a
 * non-matching one with 403 INVALID_CALLBACK_URL, so without this entry the
 * mobile social hop dies on the last leg — after the user has already
 * consented at the provider.
 */
export function mobileTrustedOrigins(env: AuthEnv): string[] {
  const raw = (env.MOBILE_APP_SCHEME ?? DEFAULT_MOBILE_APP_SCHEME).trim()
  const scheme = raw.replace(/:\/*$/, "").toLowerCase()

  if (!SCHEME_PATTERN.test(scheme)) {
    throw new Error(
      `MOBILE_APP_SCHEME must be a URL scheme like "${DEFAULT_MOBILE_APP_SCHEME}", got "${raw}".`,
    )
  }

  // A pattern with no authority and no path matches every URL on the scheme,
  // so both `obvious-auth://` and `obvious-auth://signed-in` are accepted.
  return [`${scheme}://`]
}

export interface CreateAuthOptions {
  /** Defaults to `process.env`. */
  env?: AuthEnv
  /** Defaults to the Drizzle/Postgres adapter over @app/db. */
  database?: BetterAuthOptions["database"]
  /** Framework plugins appended last (e.g. nextCookies in apps/web). */
  plugins?: BetterAuthPlugin[]
  /**
   * Where password-reset and email-verification messages go. Defaults to the
   * console mailer, which prints them instead of sending them — fine for
   * local development and CI, never for production. See `./mailer`.
   */
  mailer?: Mailer
  /**
   * Better Auth's `advanced` block. Exposed because it silently disables the
   * origin and callbackURL checks when NODE_ENV=test — a suite that wants to
   * exercise those checks has to turn them back on with
   * `{ disableOriginCheck: false }`.
   */
  advanced?: BetterAuthOptions["advanced"]
  /**
   * The structured logger for this package's own instrumentation: provider
   * boot/validation failures, rate-limit hits, rejected OAuth callbacks, and
   * password-reset/email-verification dispatch. Defaults to a leveled
   * console logger gated by AUTH_LOG_LEVEL (default "warn", so production
   * stays quiet until something actually fails). Distinct from Better
   * Auth's own `advanced` internal logger, which only customizes Better
   * Auth's own diagnostics.
   */
  logger?: AuthLogger
}

function requireEnv(env: AuthEnv, key: keyof AuthEnv, provider: string, logger: AuthLogger): string {
  const value = env[key]
  if (!value) {
    const message = `Auth provider "${provider}" is enabled via AUTH_PROVIDERS but ${key} is not set.`
    logger.error(message, { provider, missingKey: key })
    throw new Error(message)
  }
  return value
}

/**
 * Build the `socialProviders` fragment for the enabled set. A provider absent
 * from this object is rejected by Better Auth with PROVIDER_NOT_FOUND, which
 * is exactly the disabled-method contract the spec asks for.
 */
export function socialProvidersFor(
  registry: ProviderRegistry,
  env: AuthEnv,
  logger: AuthLogger,
): NonNullable<BetterAuthOptions["socialProviders"]> {
  return {
    ...(registry.has("google") && {
      google: {
        clientId: requireEnv(env, "GOOGLE_CLIENT_ID", "google", logger),
        clientSecret: requireEnv(env, "GOOGLE_CLIENT_SECRET", "google", logger),
      },
    }),
    ...(registry.has("apple") && {
      apple: {
        clientId: requireEnv(env, "APPLE_CLIENT_ID", "apple", logger),
        clientSecret: requireEnv(env, "APPLE_CLIENT_SECRET", "apple", logger),
        // Required, not optional: Apple's id token audience falls back to
        // this value, so an unset bundle id silently breaks the native
        // sign-in verification path instead of failing at boot.
        appBundleIdentifier: requireEnv(env, "APPLE_BUNDLE_ID", "apple", logger),
      },
    }),
  }
}

/**
 * The email/password fragment, including the two mail-driven flows.
 *
 * `sendResetPassword` is attached only when `email-password` is enabled, and
 * that gating is load-bearing rather than tidiness: Better Auth mounts
 * `/request-password-reset` unconditionally and gates it on the *presence of
 * this callback*, not on `emailAndPassword.enabled`. Attaching it on a
 * social-only deployment would therefore hand out password-reset links for a
 * login method that deployment does not offer — a way back in through a door
 * the operator believes is bricked up.
 *
 * `requireEmailVerification` reads the env toggle. When it is on and an
 * unverified user presents *correct* credentials, Better Auth 1.7.2 answers
 * 403 EMAIL_NOT_VERIFIED (verified in `api/routes/sign-in.mjs`) and issues no
 * session. That code is deliberately NOT collapsed into the generic
 * `INVALID_EMAIL_OR_PASSWORD` the login form shows for a bad password: the
 * check runs *after* password verification, so the only caller who can ever
 * observe it already holds the credentials and has learned nothing about who
 * else exists. Masking it would buy no enumeration resistance and would
 * strand a legitimate user on "incorrect email or password" with a password
 * that is, in fact, correct. Enumeration resistance at the pre-credential
 * boundary is unchanged: wrong password and unknown account still return the
 * same generic error.
 *
 * `sendResetPassword` is wrapped in `wrapEmailDispatch` so every attempt is
 * observable (info on dispatch, warn-and-rethrow on failure) without ever
 * logging the address or the reset URL/token — only the user id.
 */
export function emailAndPasswordConfig(
  registry: ProviderRegistry,
  env: AuthEnv,
  mailer: Mailer,
  logger: AuthLogger,
): NonNullable<BetterAuthOptions["emailAndPassword"]> {
  const enabled = registry.has("email-password")

  return {
    enabled,
    requireEmailVerification: parseRequireEmailVerification(
      env.AUTH_REQUIRE_EMAIL_VERIFICATION,
    ),
    ...(enabled && {
      sendResetPassword: wrapEmailDispatch(
        "password-reset",
        async ({ user, url }) => {
          await mailer.sendMail(passwordResetMail({ to: user.email, url }))
        },
        logger,
      ),
    }),
  }
}

/**
 * The email-verification fragment, or `undefined` when `email-password` is
 * disabled — a social-only deployment has no address this package owns the
 * proof of, since the provider already vouched for it.
 *
 * `sendOnSignUp` tracks the toggle rather than being unconditionally true:
 * with verification optional, mailing every new signup a link they are never
 * asked to click is noise, and it would change the behavior of every existing
 * signup path. With the toggle on, the link is the only way back into the
 * account, so it goes out at signup.
 *
 * `sendVerificationEmail` is wrapped the same way as `sendResetPassword`
 * above — logged, never leaking the address or the verification URL/token.
 */
export function emailVerificationConfig(
  registry: ProviderRegistry,
  env: AuthEnv,
  mailer: Mailer,
  logger: AuthLogger,
): BetterAuthOptions["emailVerification"] {
  if (!registry.has("email-password")) return undefined

  return {
    sendOnSignUp: parseRequireEmailVerification(env.AUTH_REQUIRE_EMAIL_VERIFICATION),
    sendVerificationEmail: wrapEmailDispatch(
      "email-verification",
      async ({ user, url }) => {
        await mailer.sendMail(emailVerificationMail({ to: user.email, url }))
      },
      logger,
    ),
  }
}

/**
 * The account-linking policy, chosen explicitly rather than left to Better
 * Auth's defaults.
 *
 * The spec requires a Google login and an Apple login on the same verified
 * email to resolve to ONE user — never a silent duplicate. Verified,
 * reviewing Better Auth 1.7's callback handler (`handleOAuthUserInfo`):
 * signing in with a *new* provider against an email that already has an
 * account auto-links the two the moment the incoming profile reports
 * `emailVerified: true` — trust in the provider name is only a fallback for
 * providers that do NOT self-verify email ownership. Google and Apple both
 * do (the verified email comes from a token the provider itself issued), so
 * that path already produces one user with no extra configuration.
 *
 * `trustedProviders` is set anyway so the trust decision is a line of code a
 * reviewer can see, not an inference from `emailVerified` behavior buried in
 * a dependency; it also governs the explicit `linkSocial()` API, which does
 * consult it directly. `enabled` is likewise pinned to `true` — the default —
 * so a future Better Auth version cannot flip auto-linking off underneath
 * this deployment without the diff showing up here first.
 *
 * `requireLocalEmailVerified` (the other half of the guarantee — the
 * *existing* local account must itself be verified before a new provider can
 * attach to it, closing the takeover where an attacker pre-registers an
 * unverified account at a victim's email) is intentionally left unset: it
 * already defaults to `true` and Better Auth has deprecated it toward
 * becoming unconditional, so pinning it here would just be a flag to remember
 * to delete later.
 */
export function accountLinkingConfig(): NonNullable<BetterAuthOptions["account"]> {
  return {
    accountLinking: {
      enabled: true,
      trustedProviders: ["google", "apple"],
    },
  }
}

/** The plugin list for the enabled set. `bearer` is unconditional. */
export function pluginsFor(
  registry: ProviderRegistry,
  extra: BetterAuthPlugin[] = [],
): BetterAuthPlugin[] {
  return [
    // Header sessions: the Expo client's deep-link OAuth exchange and any
    // future API-only consumer depend on them, so this is never optional.
    bearer(),
    // Rewrites the `expo-origin` header onto `origin` for requests from the
    // native app and mounts the authorization proxy the Expo client calls.
    // Not gated on AUTH_PROVIDERS: that lists login methods, not the client
    // platforms allowed to use them.
    expo(),
    ...(registry.has("passkey") ? [passkey()] : []),
    ...extra,
  ]
}

/**
 * Assemble a Better Auth instance from configuration alone. Returns the
 * registry alongside it so callers (the /api/auth-methods route, tests) read
 * the enabled set from the same object the server was built from.
 */
export function createAuth(options: CreateAuthOptions = {}) {
  const env = options.env ?? (process.env as AuthEnv)
  const registry = createProviderRegistry(env.AUTH_PROVIDERS)
  const logger = options.logger ?? createConsoleLogger(parseLogLevel(env.AUTH_LOG_LEVEL))
  const rateLimitConfig = parseRateLimitConfig(env)
  const mailer = options.mailer ?? createConsoleMailer()
  const emailVerification = emailVerificationConfig(registry, env, mailer, logger)

  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database:
      options.database ?? drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
    emailAndPassword: emailAndPasswordConfig(registry, env, mailer, logger),
    ...(emailVerification && { emailVerification }),
    socialProviders: socialProvidersFor(registry, env, logger),
    account: accountLinkingConfig(),
    trustedOrigins: mobileTrustedOrigins(env),
    plugins: pluginsFor(registry, options.plugins),
    rateLimit: rateLimitOptionsFor(rateLimitConfig),
    ...(options.advanced && { advanced: options.advanced }),
  })

  // Single choke point for every request: logs rate-limit hits and rejected
  // OAuth callbacks without touching Better Auth's own routing.
  auth.handler = withRequestLogging(auth.handler, logger)

  return { auth, registry }
}

export type AuthInstance = ReturnType<typeof createAuth>
export type Auth = AuthInstance["auth"]

/** Every route path the assembled instance actually mounts. */
export function mountedRoutes(auth: Auth): string[] {
  const paths = Object.values(auth.api)
    .map((endpoint) => (endpoint as { path?: string }).path)
    .filter((path): path is string => typeof path === "string")
  return [...new Set(paths)].sort()
}
