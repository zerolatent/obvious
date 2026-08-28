/**
 * The states the password-reset landing page can be opened in, and the path
 * the mailed link must come back to.
 *
 * Both halves live here on purpose. `RESET_PASSWORD_PATH` is what the
 * forgot-password form hands Better Auth as `redirectTo`; the parser below
 * reads the query string Better Auth appends when it redirects there. If the
 * two ever drifted, the mailed link would land on a page that cannot read it,
 * so they are one file and one test.
 *
 * The shape of that redirect is not guesswork — it is Better Auth 1.7.2's
 * `/reset-password/:token` handler: a live token redirects to
 * `<redirectTo>?token=<token>`, an expired or unknown one to
 * `<redirectTo>?error=INVALID_TOKEN`.
 */

/** Where `POST /request-password-reset` is told to send the user back to. */
export const RESET_PASSWORD_PATH = "/reset-password"

export type ResetPasswordState =
  /** A token to spend on the new-password form. */
  | { status: "ready"; token: string }
  /** No usable token: expired, already spent, or the page was opened directly. */
  | { status: "invalid"; code: string }

/** Stands in for Better Auth's `error` code when the page is opened with no token at all. */
export const MISSING_TOKEN_CODE = "MISSING_TOKEN"

export function parseResetPasswordState(search: string): ResetPasswordState {
  const params = new URLSearchParams(search)

  // Error first, and not merely for tidiness: a URL carrying both an error and
  // a leftover token must resolve to the error. Reading the token first would
  // put a form in front of the user that the server is already certain to
  // reject.
  const error = params.get("error")
  if (error) return { status: "invalid", code: error }

  const token = params.get("token")
  if (!token) return { status: "invalid", code: MISSING_TOKEN_CODE }

  return { status: "ready", token }
}
