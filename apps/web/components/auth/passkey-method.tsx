"use client"

import { useState } from "react"

import { authClient } from "../../lib/auth-client"
import type { AuthMethodProps } from "./method-registry"

type CeremonyStatus = "idle" | "authenticating" | "loggedIn"

/**
 * Passkey's login-side UI only. There is no signup form: a passkey is
 * registered from account settings once a user already has an account (see
 * `passkey-registration.tsx`), never during signup itself, so this renders
 * nothing for `mode: "signup"`.
 */
export function PasskeyMethod({ mode }: AuthMethodProps) {
  if (mode === "signup") return null
  return <PasskeyLoginButton />
}

function PasskeyLoginButton() {
  const [status, setStatus] = useState<CeremonyStatus>("idle")

  async function handleClick() {
    setStatus("authenticating")
    const { error } = await authClient.signIn.passkey()

    /**
     * Every non-success outcome here — the user dismissing the platform's
     * passkey prompt, no matching credential on the device, a timeout —
     * reaches this same `error` result; Better Auth's passkey client folds
     * them all into one shape (see PASSKEY_ERROR_CODES) and there is no
     * reliable signal in it that distinguishes "cancelled" from "failed".
     * The spec only asks that cancellation leave no trace, so treating
     * every ceremony failure the same way (silently back to idle, no error
     * banner, no navigation) satisfies that for cancellation without ever
     * under-reporting a real failure as something else.
     */
    if (error) {
      setStatus("idle")
      return
    }

    setStatus("loggedIn")
  }

  if (status === "loggedIn") {
    return <p role="status">Logged in.</p>
  }

  return (
    <button type="button" onClick={handleClick} disabled={status === "authenticating"}>
      {status === "authenticating" ? "Waiting for your passkey\u2026" : "Log in with a passkey"}
    </button>
  )
}
