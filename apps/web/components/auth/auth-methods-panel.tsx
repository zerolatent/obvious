"use client"

import { useAuthMethods } from "../../lib/use-auth-methods"
import { AuthMethodList, renderableMethods, type AuthMode } from "./method-registry"

/**
 * The page shell every login/signup surface renders through: resolve the
 * enabled methods, then hand them to the render loop. Login and signup pages
 * differ only in `mode` — everything about *which* methods appear comes from
 * the server response, never from this component.
 */
export function AuthMethodsPanel({ mode }: { mode: AuthMode }) {
  const { state, retry } = useAuthMethods()

  if (state.status === "loading") {
    return <p role="status">Loading sign-in options…</p>
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

  if (renderableMethods(state.methods).length === 0) {
    return <p>No sign-in methods are available right now.</p>
  }

  return <AuthMethodList methods={state.methods} mode={mode} />
}
