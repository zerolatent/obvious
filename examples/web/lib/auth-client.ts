import { createWebAuthClient } from "@app/auth/client"

/**
 * No `baseURL`: this app's own Next.js server proxies `/api/auth/*` and
 * `/api/auth-methods` to whichever backend `AUTH_SERVER_URL` names (see
 * next.config.mjs), so the browser only ever sees same-origin requests.
 */
export const authClient = createWebAuthClient()
