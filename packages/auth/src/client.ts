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
  })
}

export type WebAuthClient = ReturnType<typeof createWebAuthClient>
