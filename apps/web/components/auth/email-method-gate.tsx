"use client"

import type { ReactNode } from "react"

import { useAuthMethods } from "../../lib/use-auth-methods"

/**
 * Renders its children only where `email-password` is actually enabled.
 *
 * The reset and verification pages are email/password surfaces: on a
 * social-only or passkey-only deployment the server answers
 * `RESET_PASSWORD_DISABLED` and mounts no verification callbacks at all, so a
 * form here could only ever fail. Reading `/api/auth-methods` — the same
 * contract `AuthMethodsPanel` renders login and signup from — keeps that
 * decision in the deployment's configuration rather than in three separate
 * pages' guesses.
 */
export function EmailMethodGate({ children }: { children: ReactNode }) {
  const { state, retry } = useAuthMethods()

  if (state.status === "loading") {
    return <p role="status">Loading…</p>
  }

  if (state.status === "error") {
    return (
      <div role="alert">
        <p>Couldn&apos;t load sign-in options. Check your connection and try again.</p>
        <button type="button" onClick={retry}>
          Retry
        </button>
      </div>
    )
  }

  if (!state.methods.includes("email-password")) {
    return (
      <div>
        <p>This deployment doesn&apos;t use email and password sign-in.</p>
        <p>
          <a href="/login">Back to log in</a>
        </p>
      </div>
    )
  }

  return <>{children}</>
}
