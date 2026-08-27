"use client"

import { useAuthMethods } from "../../lib/use-auth-methods"
import { useOAuthCallbackState } from "../../lib/use-oauth-callback-state"
import { AuthMethodList, renderableMethods, type AuthMode } from "./method-registry"

/**
 * The page shell every login/signup surface renders through: resolve the
 * enabled methods, then hand them to the render loop. Login and signup pages
 * differ only in `mode` — everything about *which* methods appear comes from
 * the server response, never from this component.
 *
 * Also resolves the outcome of a social sign-in redirect via
 * `useOAuthCallbackState`. A cancelled attempt (`access_denied`) renders
 * nothing extra — per spec, the login page comes back unchanged. Any other
 * provider failure surfaces as a dismissible banner *above* the method list,
 * so email/password (and the social buttons themselves) stay usable right
 * next to it.
 */
export function AuthMethodsPanel({ mode }: { mode: AuthMode }) {
  const { state, retry } = useAuthMethods()
  const { state: oauthState, dismiss } = useOAuthCallbackState()

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

  return (
    <>
      {oauthState.status === "error" && (
        <div role="alert">
          <p>Sign-in didn&apos;t go through. The provider may be unavailable right now.</p>
          <button type="button" onClick={dismiss}>
            Try again
          </button>
        </div>
      )}
      <AuthMethodList methods={state.methods} mode={mode} />
    </>
  )
}
