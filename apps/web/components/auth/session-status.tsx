"use client"

import { authClient } from "../../lib/auth-client"

/**
 * The logout half of the round trip. Renders nothing while the session is
 * resolving so we never flash a "logged out" state for an authenticated
 * visitor on first paint.
 */
export function SessionStatus() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return null

  if (!session) {
    return (
      <p>
        <a href="/login">Log in</a> or <a href="/signup">sign up</a>.
      </p>
    )
  }

  return (
    <div>
      <p>Signed in as {session.user.email}</p>
      <button type="button" onClick={() => authClient.signOut()}>
        Log out
      </button>
    </div>
  )
}
