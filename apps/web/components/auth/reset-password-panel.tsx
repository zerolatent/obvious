"use client"

import { useState, type FormEvent } from "react"

import { authClient } from "../../lib/auth-client"
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_TOO_SHORT_MESSAGE,
  validateNewPassword,
} from "../../lib/password-policy"
import { parseResetPasswordState } from "../../lib/reset-password-state"
import { useLocationSearch } from "../../lib/use-location-search"
import { EmailMethodGate } from "./email-method-gate"

/**
 * What a spent, expired, or forged token gets told — and why it says nothing
 * about which. The three are indistinguishable to Better Auth by design (it
 * answers `INVALID_TOKEN` for all of them), and they have the same remedy.
 */
const INVALID_LINK_MESSAGE = "This reset link is no longer valid. Links expire an hour after they're sent, and each one works once."

/** Any failure that isn't a bad token or a rejected password. */
const GENERIC_RESET_ERROR = "Couldn't reset your password. Try again."

type SubmitStatus = "idle" | "submitting" | "error" | "done"

export function ResetPasswordPanel() {
  return (
    <EmailMethodGate>
      <ResetPasswordFlow />
    </EmailMethodGate>
  )
}

function ResetPasswordFlow() {
  const search = useLocationSearch()

  if (search === null) return <p role="status">Loading…</p>

  const state = parseResetPasswordState(search)
  if (state.status === "invalid") return <ExpiredLinkNotice />

  return <ResetPasswordForm token={state.token} />
}

function ExpiredLinkNotice() {
  return (
    <div>
      <p role="alert">{INVALID_LINK_MESSAGE}</p>
      <p>
        <a href="/forgot-password">Request a new link</a>
      </p>
    </div>
  )
}

function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("")
  const [confirmation, setConfirmation] = useState("")
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [linkRejected, setLinkRejected] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const localProblem = validateNewPassword(password, confirmation)
    if (localProblem) {
      setStatus("error")
      setErrorMessage(localProblem)
      return
    }

    setStatus("submitting")
    setErrorMessage(null)

    const { error } = await authClient.resetPassword({ token, newPassword: password })
    if (error) {
      // The token is the one thing the user can't fix from this form, so a
      // rejected token replaces the form rather than annotating it. Password
      // complaints stay inline, where the field they refer to still is.
      if (error.code === "INVALID_TOKEN") {
        setLinkRejected(true)
        return
      }

      setStatus("error")
      setErrorMessage(
        error.code === "PASSWORD_TOO_SHORT" ? PASSWORD_TOO_SHORT_MESSAGE : GENERIC_RESET_ERROR,
      )
      return
    }

    setStatus("done")
  }

  if (linkRejected) return <ExpiredLinkNotice />

  if (status === "done") {
    return (
      <div>
        <p role="status">Your password has been changed.</p>
        <p>
          <a href="/login">Log in</a>
        </p>
      </div>
    )
  }

  return (
    <form aria-label="Choose a new password" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="reset-password">New password</label>
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="reset-password-confirmation">Confirm new password</label>
        <input
          id="reset-password-confirmation"
          type="password"
          autoComplete="new-password"
          required
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Saving\u2026" : "Change password"}
      </button>
      {status === "error" && errorMessage && <p role="alert">{errorMessage}</p>}
    </form>
  )
}
