/**
 * The one client-side statement of what counts as an acceptable new password.
 *
 * The server is still the authority — `POST /reset-password` answers
 * `PASSWORD_TOO_SHORT` on its own — but a round trip to learn that eight
 * characters are needed is a round trip the user should not have to spend, and
 * the confirmation-match rule has no server-side counterpart at all (Better
 * Auth never sees the second field).
 */

/** Better Auth's own default `minPasswordLength`, restated so the form can say it first. */
export const MIN_PASSWORD_LENGTH = 8

export const PASSWORD_TOO_SHORT_MESSAGE = `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
export const PASSWORD_MISMATCH_MESSAGE = "Both passwords must match."

/**
 * The first problem with a proposed password, or `null` when there is none.
 *
 * Returns a single message rather than a list: the form shows one alert, and
 * a user who has typed four characters into both fields does not need to be
 * told about the length *and* reassured about the match.
 */
export function validateNewPassword(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return PASSWORD_TOO_SHORT_MESSAGE
  if (password !== confirmation) return PASSWORD_MISMATCH_MESSAGE
  return null
}
