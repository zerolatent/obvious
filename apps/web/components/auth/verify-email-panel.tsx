"use client"

import { useEffect, useState, type FormEvent } from "react"

import { authClient } from "../../lib/auth-client"
import { useLocationSearch } from "../../lib/use-location-search"
import { parseVerifyEmailState, VERIFY_EMAIL_CALLBACK_URL } from "../../lib/verify-email-state"
import { EmailMethodGate } from "./email-method-gate"

/**
 * Shown after every resend request, whatever happened — the same
 * anti-enumeration reasoning as `RESET_REQUEST_CONFIRMATION`, with one extra
 * case it also has to cover: `POST /send-verification-email` answers
 * `{ status: true }` and mails nothing when the address is already verified.
 * Reporting "sent" only when mail actually went out would therefore leak both
 * who has an account and who has already confirmed one.
 */
export const RESEND_CONFIRMATION =
  "If that address needs verifying, a new link is on its way. Links expire an hour after they're sent."

const INVALID_LINK_MESSAGE =
  "This verification link is no longer valid. It may have expired or already been used."

type VerificationStatus = "verifying" | "verified" | "invalid"
type ResendStatus = "idle" | "submitting" | "sent"

export function VerifyEmailPanel() {
  return (
    <EmailMethodGate>
      <VerifyEmailFlow />
    </EmailMethodGate>
  )
}

function VerifyEmailFlow() {
  const search = useLocationSearch()

  if (search === null) return <p role="status">Loading…</p>

  const state = parseVerifyEmailState(search)
  switch (state.status) {
    case "pending":
      return <TokenVerification token={state.token} />
    case "verified":
      return <VerifiedNotice />
    case "invalid":
      return <InvalidLinkNotice />
    case "idle":
      return <IdleNotice />
  }
}

/**
 * Runs the verification call for a link that handed us the token directly,
 * rather than one the server already redeemed on its way here.
 */
function TokenVerification({ token }: { token: string }) {
  const [status, setStatus] = useState<VerificationStatus>("verifying")

  useEffect(() => {
    let cancelled = false

    authClient
      .verifyEmail({ query: { token } })
      .then(({ error }) => {
        if (!cancelled) setStatus(error ? "invalid" : "verified")
      })
      .catch(() => {
        // A transport failure and a rejected token are the same thing to the
        // person reading this page: the link did not work, try another. There
        // is nothing to withhold here — unlike the request forms, this state
        // is reached by holding a token, not by naming an address.
        if (!cancelled) setStatus("invalid")
      })

    return () => {
      cancelled = true
    }
  }, [token])

  if (status === "verifying") return <p role="status">Verifying your email address…</p>
  if (status === "verified") return <VerifiedNotice />
  return <InvalidLinkNotice />
}

function VerifiedNotice() {
  return (
    <div>
      <p role="status">Your email address is verified.</p>
      <p>
        <a href="/login">Log in</a>
      </p>
    </div>
  )
}

function InvalidLinkNotice() {
  return (
    <div>
      <p role="alert">{INVALID_LINK_MESSAGE}</p>
      <ResendVerification />
    </div>
  )
}

function IdleNotice() {
  return (
    <div>
      <p>Verification links arrive by email. Open the one we sent you, or ask for another below.</p>
      <ResendVerification />
    </div>
  )
}

function ResendVerification() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<ResendStatus>("idle")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")

    try {
      await authClient.sendVerificationEmail({ email, callbackURL: VERIFY_EMAIL_CALLBACK_URL })
    } catch {
      // Deliberately not surfaced — see RESEND_CONFIRMATION.
    }

    setStatus("sent")
  }

  if (status === "sent") {
    return (
      <div>
        <p role="status">{RESEND_CONFIRMATION}</p>
        <p>
          <a href="/login">Back to log in</a>
        </p>
      </div>
    )
  }

  return (
    <form aria-label="Resend the verification email" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="verify-email-address">Email</label>
        <input
          id="verify-email-address"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending\u2026" : "Send a new link"}
      </button>
    </form>
  )
}
