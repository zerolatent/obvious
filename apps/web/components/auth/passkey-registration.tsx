"use client"

import { useState } from "react"

import { authClient } from "../../lib/auth-client"
import { useAuthMethods } from "../../lib/use-auth-methods"
import { isPasskeySupported } from "../../lib/webauthn-support"

type RegistrationStatus = "idle" | "registering" | "registered" | "error"

/**
 * The account-settings half of the passkey lane: lets an already
 * signed-in user add a passkey to their account (the server requires a
 * fresh session for `/passkey/verify-registration` — see
 * `packages/auth/src/server.ts` — so this only ever runs for someone
 * already past login).
 *
 * Hidden entirely, never shown disabled, unless the deployment has passkey
 * enabled AND this browser can run a WebAuthn ceremony — the same
 * enabled-AND-supported gate `renderableMethods` applies to the login
 * button.
 */
export function PasskeyRegistration() {
  const { state } = useAuthMethods()
  const [status, setStatus] = useState<RegistrationStatus>("idle")

  if (state.status !== "ready") return null
  if (!state.methods.includes("passkey")) return null
  if (!isPasskeySupported()) return null

  async function handleClick() {
    setStatus("registering")
    const { error } = await authClient.passkey.addPasskey()
    if (error) {
      setStatus("error")
      return
    }
    setStatus("registered")
  }

  return (
    <section>
      <h2>Passkeys</h2>
      {status === "registered" ? (
        <p role="status">Passkey added.</p>
      ) : (
        <>
          <button type="button" onClick={handleClick} disabled={status === "registering"}>
            {status === "registering" ? "Adding passkey\u2026" : "Add a passkey"}
          </button>
          {status === "error" && <p role="alert">Couldn&apos;t add a passkey. Try again.</p>}
        </>
      )}
    </section>
  )
}
