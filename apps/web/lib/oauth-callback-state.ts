/**
 * The states a full-page redirect back from an OAuth provider's consent
 * screen can land the client in.
 *
 * Better Auth encodes the outcome of a social sign-in attempt into query
 * params on the URL it redirects the browser to (see the `errorCallbackURL`
 * wired in `components/auth/social-method.tsx`, and the server's
 * `redirectOnError` handler in its `/callback/:id` route). This module is the
 * pure parser for that contract, so the two outcomes the spec distinguishes —
 * the user backing out of consent vs. everything else — can be asserted
 * without a browser or a network call.
 */
export type OAuthCallbackState =
  | { status: "none" }
  /** The user backed out of the provider's consent screen. Login page: unchanged. */
  | { status: "cancelled" }
  /** Any other failure Better Auth reports on the callback redirect. */
  | { status: "error"; code: string }

/**
 * Better Auth's OAuth2 error code (RFC 6749 §4.1.2.1, `access_denied`) for a
 * user declining consent. The one outcome the spec says must NOT surface as
 * an error.
 */
const USER_CANCELLED_CODE = "access_denied"

/** Reads the `error` query param a callback redirect appended, if any. */
export function parseOAuthCallbackState(search: string): OAuthCallbackState {
  const code = new URLSearchParams(search).get("error")
  if (!code) return { status: "none" }
  if (code === USER_CANCELLED_CODE) return { status: "cancelled" }
  return { status: "error", code }
}
