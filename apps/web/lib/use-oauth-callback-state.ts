"use client"

import { useCallback, useEffect, useState } from "react"

import { parseOAuthCallbackState, type OAuthCallbackState } from "./oauth-callback-state"

export interface UseOAuthCallbackStateResult {
  state: OAuthCallbackState
  /** Clears an `error` state, e.g. so the user can start a fresh attempt. */
  dismiss: () => void
}

/**
 * Resolves the outcome of a social sign-in redirect on mount, then scrubs the
 * query string.
 *
 * The scrub matters for both recognized outcomes: a cancelled sign-in must
 * leave the login page looking exactly as if the user had never clicked
 * anything (a lingering `?error=access_denied` would replay on refresh or a
 * shared link), and an error banner must not reappear from history/back-
 * forward navigation once shown.
 */
export function useOAuthCallbackState(): UseOAuthCallbackStateResult {
  const [state, setState] = useState<OAuthCallbackState>({ status: "none" })

  useEffect(() => {
    const parsed = parseOAuthCallbackState(window.location.search)
    if (parsed.status !== "none") {
      window.history.replaceState(null, "", window.location.pathname)
    }
    setState(parsed)
  }, [])

  const dismiss = useCallback(() => setState({ status: "none" }), [])

  return { state, dismiss }
}
