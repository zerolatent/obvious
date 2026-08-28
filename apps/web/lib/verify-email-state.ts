/**
 * The states the email-verification page can be opened in, and the callback
 * URL that produces them.
 *
 * Verification links can reach this page two ways, and the page has to serve
 * both:
 *
 *   1. **The server already ran the ceremony.** The mailed link points at
 *      `GET /api/auth/verify-email?token=…&callbackURL=…`. Better Auth 1.7.2
 *      verifies the token itself and then redirects to `callbackURL` —
 *      unchanged on success, with `?error=TOKEN_EXPIRED|INVALID_TOKEN`
 *      appended on failure. Success and a cold visit would be
 *      indistinguishable (both are a bare `/verify-email`), which is why
 *      `VERIFY_EMAIL_CALLBACK_URL` carries a `verified` marker: it is the
 *      only thing that tells "your address is now proven" apart from "you
 *      wandered here".
 *   2. **The token is handed to us.** A deployment whose mail template links
 *      straight at the app lands here with `?token=…`. That call —
 *      `GET /verify-email?token=…` with no `callbackURL` — answers JSON
 *      rather than redirecting, so the page can run the ceremony itself and
 *      show a real "verifying" state.
 *
 * Producer and parser live in one file so the marker cannot drift from the
 * code that reads it.
 */

/** The marker appended to the callback URL so a completed verification is recognizable. */
export const VERIFIED_PARAM = "verified"

/**
 * What every surface that mails a verification link passes as `callbackURL`
 * (the signup form and the resend action below it).
 */
export const VERIFY_EMAIL_CALLBACK_URL = `/verify-email?${VERIFIED_PARAM}=1`

export type VerifyEmailState =
  /** A token is in the URL and the ceremony has not run yet. */
  | { status: "pending"; token: string }
  /** The server verified the address and sent the user back here. */
  | { status: "verified" }
  /** The link was expired, malformed, or already consumed by another account. */
  | { status: "invalid"; code: string }
  /** Opened with nothing to act on — offer a resend and say so plainly. */
  | { status: "idle" }

export function parseVerifyEmailState(search: string): VerifyEmailState {
  const params = new URLSearchParams(search)

  // Error wins over everything else. Better Auth appends `error` to the
  // callback URL *without* stripping what was already on it, so a failed
  // verification arrives as `?verified=1&error=TOKEN_EXPIRED` — reading the
  // marker first would report success for a link that just failed.
  const error = params.get("error")
  if (error) return { status: "invalid", code: error }

  const token = params.get("token")
  if (token) return { status: "pending", token }

  if (params.get(VERIFIED_PARAM)) return { status: "verified" }

  return { status: "idle" }
}
