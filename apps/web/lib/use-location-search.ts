"use client"

import { useEffect, useState } from "react"

/**
 * The current URL's query string, or `null` until it is known.
 *
 * Reading `window.location.search` during render would be wrong twice over:
 * these pages are server-rendered first, where there is no `window` at all,
 * and a value that appears on the client but not on the server is exactly the
 * hydration mismatch React warns about. Resolving it in an effect gives every
 * consumer one honest "not read yet" state to render instead.
 *
 * The token stays in the URL rather than being scrubbed the way
 * `useOAuthCallbackState` scrubs its error code. Scrubbing would break a
 * refresh — the token is the whole reason the page is open — and the exposure
 * it would buy back is small: reset and verification tokens are single-use and
 * expire in an hour.
 */
export function useLocationSearch(): string | null {
  const [search, setSearch] = useState<string | null>(null)

  useEffect(() => {
    setSearch(window.location.search)
  }, [])

  return search
}
