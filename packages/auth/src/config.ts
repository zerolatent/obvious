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
