"use client"

import type { AuthMethodsResponse, ProviderId } from "@app/auth"
import { useCallback, useEffect, useState } from "react"

/**
 * The states a consumer of `/api/auth-methods` renders. `methods` is the
 * single source of truth for which auth UI exists at all — every page that
 * offers signup or login goes through this fetch before rendering a form.
 */
export type AuthMethodsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; methods: ProviderId[] }

export interface UseAuthMethodsResult {
  state: AuthMethodsState
  /** Re-runs the fetch. Only meaningful from the `error` state. */
  retry: () => void
}

/** Pure fetch, kept separate from the hook so it's testable without React. */
export async function fetchAuthMethods(): Promise<ProviderId[]> {
  const response = await fetch("/api/auth-methods")
  if (!response.ok) {
    throw new Error(`GET /api/auth-methods failed with status ${response.status}`)
  }
  const data = (await response.json()) as AuthMethodsResponse
  return data.methods
}

export function useAuthMethods(): UseAuthMethodsResult {
  const [state, setState] = useState<AuthMethodsState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: "loading" })

    fetchAuthMethods()
      .then((methods) => {
        if (!cancelled) setState({ status: "ready", methods })
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" })
      })

    return () => {
      cancelled = true
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((previous) => previous + 1), [])

  return { state, retry }
}
