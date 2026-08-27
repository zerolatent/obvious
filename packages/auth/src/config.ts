/**
 * The provider registry: the single seam that turns deployment configuration
 * into mounted auth capability. Everything downstream — the Better Auth
 * instance, the /api/auth-methods response, the client UIs — reads the
 * enabled set from here, so no surface can drift from another.
 */

/** Every provider id this build knows how to mount. Order is canonical. */
export const KNOWN_PROVIDERS = ["email-password", "google", "apple", "passkey"] as const

export type ProviderId = (typeof KNOWN_PROVIDERS)[number]

/** Applied when AUTH_PROVIDERS is unset or blank. */
export const DEFAULT_PROVIDERS: readonly ProviderId[] = ["email-password"]

function isKnownProvider(value: string): value is ProviderId {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Parse the comma-separated AUTH_PROVIDERS value into a canonical, deduplicated
 * provider list. Unknown ids throw: a typo must fail at boot, not silently
 * disable a login method in production.
 */
export function parseProviders(raw: string | undefined): ProviderId[] {
  const requested = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)

  if (requested.length === 0) return [...DEFAULT_PROVIDERS]

  const unknown = requested.filter((entry) => !isKnownProvider(entry))
  if (unknown.length > 0) {
    throw new Error(
      `Unknown auth providers in AUTH_PROVIDERS: ${unknown.join(", ")}. ` +
        `Known providers: ${KNOWN_PROVIDERS.join(", ")}.`,
    )
  }

  // Filtering KNOWN_PROVIDERS (rather than mapping `requested`) dedupes and
  // pins the order, so two deployments listing the same set are identical.
  return KNOWN_PROVIDERS.filter((known) => requested.includes(known))
}

/** Accepted spellings for a boolean env var, in both directions. */
const TRUE_VALUES = ["1", "true", "yes", "on"]
const FALSE_VALUES = ["0", "false", "no", "off"]

/**
 * Parse a boolean environment variable.
 *
 * Unset or blank takes `fallback`; anything outside the accepted spellings
 * throws, for the same reason an unknown id in AUTH_PROVIDERS throws: a typo
 * that silently reads as `false` would disable a security control in
 * production while the deployment believes it is on.
 */
export function parseBooleanEnv(
  raw: string | undefined,
  options: { name: string; fallback: boolean },
): boolean {
  const value = (raw ?? "").trim().toLowerCase()
  if (value.length === 0) return options.fallback
  if (TRUE_VALUES.includes(value)) return true
  if (FALSE_VALUES.includes(value)) return false

  throw new Error(
    `${options.name} must be one of ${[...TRUE_VALUES, ...FALSE_VALUES].join(", ")}, got "${raw}".`,
  )
}

/**
 * Whether a session may be issued to an account whose email is unproven.
 *
 * Defaults OFF: turning it on is a breaking change for any deployment with
 * existing unverified users (they are all locked out at once, and every
 * signup gains a mandatory round-trip through a mailbox), so it has to be an
 * explicit deployment decision rather than something a version bump does to
 * you.
 */
export function parseRequireEmailVerification(raw: string | undefined): boolean {
  return parseBooleanEnv(raw, { name: "AUTH_REQUIRE_EMAIL_VERIFICATION", fallback: false })
}

export interface ProviderRegistry {
  /** The enabled providers, in canonical order. */
  readonly enabled: readonly ProviderId[]
  has(id: ProviderId): boolean
}

export function createProviderRegistry(raw: string | undefined): ProviderRegistry {
  const enabled = parseProviders(raw)
  return {
    enabled,
    has: (id: ProviderId) => enabled.includes(id),
  }
}

/** Shape of the auth-methods contract every client resolves before rendering. */
export interface AuthMethodsResponse {
  methods: ProviderId[]
}

export function authMethodsResponse(registry: ProviderRegistry): AuthMethodsResponse {
  return { methods: [...registry.enabled] }
}
