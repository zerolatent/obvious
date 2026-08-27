import { passkeyClient } from "@better-auth/passkey/client"
import { createAuthClient } from "better-auth/react"

export interface WebAuthClientOptions {
  /** Omit when the client is served from the same origin as the auth server. */
  baseURL?: string | undefined
}

/**
 * The typed web client: Better Auth's React hooks over cookie sessions.
 *
 * The passkey client plugin is always registered — it only adds callable
 * actions, and which methods a user actually sees comes from
 * GET /api/auth-methods. A passkey call against a server that did not mount
 * the plugin returns 404 rather than silently succeeding.
 */
export function createWebAuthClient(options: WebAuthClientOptions = {}) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [passkeyClient()],
    fetchOptions: {
      // better-auth otherwise snapshots the global `fetch` reference once,
      // at client-construction time. Indirecting through `globalThis.fetch`
      // on every call keeps this client working when something swaps the
      // global out after construction (tests stubbing `fetch` chief among
      // them) instead of silently keeping the stale reference forever.
      customFetchImpl: (...args) => globalThis.fetch(...args),
    },
  })
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>
