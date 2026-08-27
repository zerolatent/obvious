/**
 * Email/password signup, login and logout, expressed over the auth client's
 * actions rather than the client itself: the normalization below is where the
 * product decisions live (what the user is told when a call fails), and it
 * should be verifiable without a device or a server.
 */

/** Better Auth's uniform `{ data, error }` action result, narrowed to what we read. */
export interface AuthActionResult {
  error?: { message?: string | undefined; code?: string | undefined } | null
}

export interface EmailPasswordActions {
  signUp(input: { email: string; password: string; name: string }): Promise<AuthActionResult>
  signIn(input: { email: string; password: string }): Promise<AuthActionResult>
  signOut(): Promise<AuthActionResult>
}

export type FlowResult = { status: "success" } | { status: "error"; message: string }

/** Better Auth's own default minimum; stated here so the client can say so first. */
export const MIN_PASSWORD_LENGTH = 8

const GENERIC_SIGN_IN_ERROR = "Email or password is incorrect."
const DISABLED_METHOD_ERROR = "Email and password sign-in is not enabled for this deployment."
const UNAVAILABLE_ERROR = "Could not reach the auth server. Check your connection and try again."

/** Codes the server returns when AUTH_PROVIDERS does not include email-password. */
const DISABLED_CODES = new Set(["EMAIL_PASSWORD_DISABLED", "EMAIL_PASSWORD_SIGN_UP_DISABLED"])

export function validateEmail(email: string): string | null {
  const trimmed = email.trim()
  if (trimmed.length === 0) return "Enter your email address."
  // Deliberately permissive: the server verifies the address, the client only
  // catches the obviously-not-an-email case before spending a round trip.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return "Enter a valid email address."
  return null
}

export function validatePassword(password: string): string | null {
  if (password.length === 0) return "Enter your password."
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  return null
}

function failureMessage(result: AuthActionResult, fallback: string): string {
  const code = result.error?.code
  if (code && DISABLED_CODES.has(code)) return DISABLED_METHOD_ERROR
  return fallback
}

export async function signUpWithEmail(
  actions: EmailPasswordActions,
  input: { email: string; password: string; name: string },
): Promise<FlowResult> {
  const invalid = validateEmail(input.email) ?? validatePassword(input.password)
  if (invalid) return { status: "error", message: invalid }

  let result: AuthActionResult
  try {
    result = await actions.signUp({ ...input, email: input.email.trim() })
  } catch {
    return { status: "error", message: UNAVAILABLE_ERROR }
  }

  if (result.error) {
    // Signup errors are shown as the server phrased them ("email already
    // registered" is not enumeration on the surface that creates accounts).
    return {
      status: "error",
      message: failureMessage(result, result.error.message ?? "Could not create your account."),
    }
  }
  return { status: "success" }
}

export async function signInWithEmail(
  actions: EmailPasswordActions,
  input: { email: string; password: string },
): Promise<FlowResult> {
  const invalid = validateEmail(input.email) ?? validatePassword(input.password)
  if (invalid) return { status: "error", message: invalid }

  let result: AuthActionResult
  try {
    result = await actions.signIn({ email: input.email.trim(), password: input.password })
  } catch {
    return { status: "error", message: UNAVAILABLE_ERROR }
  }

  if (result.error) {
    // One message for every credential failure: a distinct "no such account"
    // would let anyone probe which emails are registered.
    return { status: "error", message: failureMessage(result, GENERIC_SIGN_IN_ERROR) }
  }
  return { status: "success" }
}

export async function signOut(actions: EmailPasswordActions): Promise<FlowResult> {
  let result: AuthActionResult
  try {
    result = await actions.signOut()
  } catch {
    return { status: "error", message: UNAVAILABLE_ERROR }
  }

  if (result.error) {
    return { status: "error", message: result.error.message ?? "Could not sign out." }
  }
  return { status: "success" }
}
