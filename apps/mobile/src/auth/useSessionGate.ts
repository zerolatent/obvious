import { useCallback, useEffect, useState } from "react"

import {
  expoBiometricAuthenticator,
  openStoredSession,
  type SessionGateState,
} from "./biometricGate"

export type SessionGateStatus = { status: "checking" } | SessionGateState

/**
 * Runs the gate on app open and on each retry.
 *
 * If the native module cannot even be loaded the session is revealed: an
 * unavailable sensor must never be the reason a signed-in user cannot reach
 * their account (see ./biometricGate).
 */
export function useSessionGate(hasStoredSession: boolean) {
  const [state, setState] = useState<SessionGateStatus>({ status: "checking" })
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setState({ status: "checking" })

    const run = async (): Promise<SessionGateState> => {
      try {
        const authenticator = await expoBiometricAuthenticator()
        return await openStoredSession({ hasStoredSession, authenticator })
      } catch {
        return hasStoredSession
          ? { status: "unlocked", reason: "unavailable" }
          : { status: "signed-out" }
      }
    }

    void run().then((next) => {
      if (!cancelled) setState(next)
    })

    return () => {
      cancelled = true
    }
  }, [hasStoredSession, attempt])

  const retry = useCallback(() => setAttempt((count) => count + 1), [])

  return { state, retry }
}
