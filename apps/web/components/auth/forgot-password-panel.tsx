"use client"

import { useState, type FormEvent } from "react"

import { authClient } from "../../lib/auth-client"
import { RESET_PASSWORD_PATH } from "../../lib/reset-password-state"
import { EmailMethodGate } from "./email-method-gate"

/**
 * Shown after every reset request, whatever happened.
 *
 * This is the client-side half of the server's anti-enumeration invariant —
 * the same shape `GENERIC_LOGIN_ERROR` takes in `EmailPasswordMethod`.
 * `POST /request-password-reset` already answers identically for a known and
 * an unknown address; the form would give that back for free if it rendered
 * anything conditional on the outcome, so it renders this instead.
 */
export const RESET_REQUEST_CONFIRMATION =
  "If an account exists for that address, we've sent a link to reset its password. The link expires in an hour."

type RequestStatus = "idle" | "submitting" | "sent"

export function ForgotPasswordPanel() {
  return (
    <EmailMethodGate>
      <ForgotPasswordForm />
    </EmailMethodGate>
  )
}

function ForgotPasswordForm() {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<RequestStatus>("idle")

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")

    try {
      await authClient.requestPasswordReset({ email, redirectTo: RESET_PASSWORD_PATH })
    } catch {
      // Swallowed on purpose, and only here. A transport failure is
      // observable to the user as timing at worst, but rendering it would
      // split this form's output into "something went wrong" for addresses
      // the server refused to look up and silence for the rest — which is
      // precisely the signal the generic copy exists to withhold. The cost is
      // real: a server outage tells everyone to check their inbox. Delivery
      // failures belong in the operator's logs, where `mailer.sendMail`
      // throwing already puts them.
    }

    setStatus("sent")
  }

  if (status === "sent") {
    return (
      <div>
        <p role="status">{RESET_REQUEST_CONFIRMATION}</p>
        <p>
          <a href="/login">Back to log in</a>
        </p>
      </div>
    )
  }

  return (
    <form aria-label="Request a password reset" onSubmit={handleSubmit}>
      <p>Enter your email address and we&apos;ll send you a link to choose a new password.</p>
      <div>
        <label htmlFor="forgot-password-email">Email</label>
        <input
          id="forgot-password-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Sending\u2026" : "Send reset link"}
      </button>
      <p>
        <a href="/login">Back to log in</a>
      </p>
    </form>
  )
}
