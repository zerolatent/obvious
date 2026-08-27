import { useCallback, useEffect, useState } from "react"

import { AUTH_BASE_URL } from "./config"
import { fetchAuthMethods, type AuthMethods } from "./methods"

export type AuthMethodsState =
  { status: "loading" } | ({ status: "ready" } & AuthMethods) | { status: "error"; message: string }

/**
 * Resolve the enabled methods before rendering a single button, exactly as the
 * web client does. Every non-happy path is a state the screen can render: the
 * alternative is a login screen that silently shows nothing.
 */
export function useAuthMethods(baseURL: string = AUTH_BASE_URL) {
  const [state, setState] = useState<AuthMethodsState>({ status: "loading" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setState({ status: "loading" })

    fetchAuthMethods({ baseURL, signal: controller.signal })
      .then((resolved) => {
        if (!controller.signal.aborted) setState({ status: "ready", ...resolved })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        })
      })

    return () => controller.abort()
  }, [baseURL, attempt])

  const reload = useCallback(() => setAttempt((count) => count + 1), [])

  return { state, reload }
}
