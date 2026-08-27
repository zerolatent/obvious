import { createWebAuthClient } from "@app/auth/client"

/**
 * The web app's typed Better Auth client, built once per module load.
 *
 * No `baseURL` is passed: the app both serves the UI and mounts the auth
 * server at `/api/auth/[...all]`, so same-origin requests are correct by
 * default. Mirrors the lazy-singleton shape of `lib/auth.ts` on the server
 * side.
 */
export const authClient = createWebAuthClient()
