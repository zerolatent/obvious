import { toNextJsHandler } from "better-auth/next-js"

import { getAuth } from "../../../../lib/auth"

/**
 * The whole Better Auth route surface. Which paths actually exist under it is
 * decided by AUTH_PROVIDERS via the provider registry — this file never names
 * a provider.
 */
export const { GET, POST } = toNextJsHandler((request: Request) =>
  getAuth().auth.handler(request),
)
