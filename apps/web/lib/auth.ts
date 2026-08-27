import { createAuth } from "@app/auth"
import { nextCookies } from "better-auth/next-js"

let instance: ReturnType<typeof createAuth> | undefined

/**
 * The web app's auth instance, built on first request rather than at import.
 *
 * Lazy on purpose: the module graph is evaluated during `next build`, and a
 * build machine has no database. Deferring keeps the DATABASE_URL requirement
 * where it belongs — at runtime.
 *
 * `nextCookies` is passed last so it observes every other plugin's cookies.
 */
export function getAuth(): ReturnType<typeof createAuth> {
  instance ??= createAuth({ plugins: [nextCookies()] })
  return instance
}
