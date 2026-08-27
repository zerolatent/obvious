import { KNOWN_PROVIDERS, type ProviderId } from "@app/auth"

/** The contract every client resolves before rendering a single button. */
export const AUTH_METHODS_PATH = "/api/auth-methods"

export function authMethodsUrl(baseURL: string): string {
  return `${baseURL.replace(/\/+$/, "")}${AUTH_METHODS_PATH}`
}

export interface AuthMethods {
  /** Enabled methods this build can render, in the registry's canonical order. */
  methods: ProviderId[]
  /**
   * Enabled ids this build does not know how to render — a server newer than
   * the installed app. Surfaced rather than dropped so "the button is missing"
   * is explainable instead of mysterious.
   */
  unsupported: string[]
}

function isProviderId(value: string): value is ProviderId {
  return (KNOWN_PROVIDERS as readonly string[]).includes(value)
}

/**
 * Validate the server's response against the shared provider vocabulary.
 *
 * A malformed body throws: rendering "no methods available" when the server
 * actually offers several is a worse failure than an explicit error state.
 */
export function parseAuthMethods(payload: unknown): AuthMethods {
  if (typeof payload !== "object" || payload === null || !("methods" in payload)) {
    throw new Error(`${AUTH_METHODS_PATH} returned no "methods" field`)
  }

  const { methods } = payload as { methods: unknown }
  if (!Array.isArray(methods) || methods.some((entry) => typeof entry !== "string")) {
    throw new Error(`${AUTH_METHODS_PATH} returned a non-string method list`)
  }

  const advertised = methods as string[]
  return {
    // Filtering the canonical list (rather than mapping the response) pins the
    // render order to the same order the server's registry uses.
    methods: KNOWN_PROVIDERS.filter((known) => advertised.includes(known)),
    unsupported: advertised.filter((entry) => !isProviderId(entry)),
  }
}

export interface FetchAuthMethodsOptions {
  baseURL: string
  /** Injected so tests never touch the network; defaults to global fetch. */
  fetchImpl?: typeof fetch
  signal?: AbortSignal | undefined
}

export async function fetchAuthMethods(options: FetchAuthMethodsOptions): Promise<AuthMethods> {
  const fetchImpl = options.fetchImpl ?? fetch
  const response = await fetchImpl(authMethodsUrl(options.baseURL), {
    headers: { accept: "application/json" },
    signal: options.signal,
  })

  if (!response.ok) {
    throw new Error(`${AUTH_METHODS_PATH} responded ${response.status}`)
  }

  return parseAuthMethods(await response.json())
}
