import { authSchema, getDb } from "@app/db"
import { expo } from "@better-auth/expo"
import { passkey } from "@better-auth/passkey"
import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { bearer } from "better-auth/plugins/bearer"

import { createProviderRegistry, type ProviderRegistry } from "./config"

/**
 * The environment slice auth reads. Passed in rather than read from
 * `process.env` at module scope so a test can build an instance for any
 * provider subset without mutating global state.
 */
export interface AuthEnv {
  AUTH_PROVIDERS?: string | undefined
  BETTER_AUTH_SECRET?: string | undefined
  BETTER_AUTH_URL?: string | undefined
  GOOGLE_CLIENT_ID?: string | undefined
  GOOGLE_CLIENT_SECRET?: string | undefined
  APPLE_CLIENT_ID?: string | undefined
  APPLE_CLIENT_SECRET?: string | undefined
  APPLE_BUNDLE_ID?: string | undefined
  MOBILE_APP_SCHEME?: string | undefined
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
   * Better Auth's `advanced` block. Exposed because it silently disables the
   * origin and callbackURL checks when NODE_ENV=test — a suite that wants to
   * exercise those checks has to turn them back on with
   * `{ disableOriginCheck: false }`.
   */
  advanced?: BetterAuthOptions["advanced"]
}

function requireEnv(env: AuthEnv, key: keyof AuthEnv, provider: string): string {
  const value = env[key]
  if (!value) {
    throw new Error(
      `Auth provider "${provider}" is enabled via AUTH_PROVIDERS but ${key} is not set.`,
    )
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
): NonNullable<BetterAuthOptions["socialProviders"]> {
  return {
    ...(registry.has("google") && {
      google: {
        clientId: requireEnv(env, "GOOGLE_CLIENT_ID", "google"),
        clientSecret: requireEnv(env, "GOOGLE_CLIENT_SECRET", "google"),
      },
    }),
    ...(registry.has("apple") && {
      apple: {
        clientId: requireEnv(env, "APPLE_CLIENT_ID", "apple"),
        clientSecret: requireEnv(env, "APPLE_CLIENT_SECRET", "apple"),
        // Required, not optional: Apple's id token audience falls back to
        // this value, so an unset bundle id silently breaks the native
        // sign-in verification path instead of failing at boot.
        appBundleIdentifier: requireEnv(env, "APPLE_BUNDLE_ID", "apple"),
      },
    }),
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

  const auth = betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database:
      options.database ?? drizzleAdapter(getDb(), { provider: "pg", schema: authSchema }),
    emailAndPassword: {
      enabled: registry.has("email-password"),
    },
    socialProviders: socialProvidersFor(registry, env),
    account: accountLinkingConfig(),
    trustedOrigins: mobileTrustedOrigins(env),
    plugins: pluginsFor(registry, options.plugins),
    ...(options.advanced && { advanced: options.advanced }),
  })

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
