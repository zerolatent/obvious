/**
 * The forgot-password entry point on mobile.
 *
 * Password reset is an email round-trip: the link in the mail opens the web
 * app's /reset-password page, where the new password is chosen. So the mobile
 * app's whole job is to hand the user to that page in the system browser — the
 * same hop-out-and-back shape social sign-in uses, minus the return trip: the
 * reset completes on the web, and the user returns to the app to sign in with
 * the new password.
 *
 * Like every flow here, the browser hop is a port: the logic is exercised in
 * tests without a device, and the concrete `Linking.openURL` lives in
 * ./actions.
 */

export interface ForgotPasswordPorts {
  /** Opens a URL outside the app (react-native's `Linking.openURL`). */
  openURL(url: string): Promise<unknown>
  /** Origin of the auth server, which also serves the web app. */
  authBaseURL: string
}

export type ForgotPasswordOutcome =
  | { status: "opened" }
  | { status: "error"; message: string }

/** The web page that owns the request-a-reset form. */
export function forgotPasswordURL(authBaseURL: string): string {
  return `${authBaseURL}/forgot-password`
}

export async function openForgotPassword(ports: ForgotPasswordPorts): Promise<ForgotPasswordOutcome> {
  try {
    await ports.openURL(forgotPasswordURL(ports.authBaseURL))
    return { status: "opened" }
  } catch (error) {
    // No URL handler, no browser, OS-level refusal — all land here. The
    // sign-in screen stays usable; the detail is kept because "no browser on
    // this device" and "the auth server is unreachable" need different
    // reactions from the user.
    const message = error instanceof Error ? error.message : String(error)
    return { status: "error", message: `Couldn't open the reset page: ${message}` }
  }
}
