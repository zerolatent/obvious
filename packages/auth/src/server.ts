import { authSchema, getDb } from "@app/db"
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
}

export interface CreateAuthOptions {
  /** Defaults to `process.env`. */
  env?: AuthEnv
  /** Defaults to the Drizzle/Postgres adapter over @app/db. */
  database?: BetterAuthOptions["database"]
  /** Framework plugins appended last (e.g. nextCookies in apps/web). */
  plugins?: BetterAuthPlugin[]
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
        appBundleIdentifier: env.APPLE_BUNDLE_ID,
      },
    }),
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
    plugins: pluginsFor(registry, options.plugins),
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
