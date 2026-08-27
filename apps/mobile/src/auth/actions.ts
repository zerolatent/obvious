import { authClient } from "./client"
import type { EmailPasswordActions } from "./emailPassword"
import type { SocialSignInPorts } from "./socialSignIn"
import { APP_SCHEME } from "./config"

/**
 * The only place the concrete auth client meets the flow logic. Everything
 * downstream takes these ports, so the flows are exercised in tests without a
 * server, a browser, or a device.
 */

export const emailPasswordActions: EmailPasswordActions = {
  signUp: (input) => authClient.signUp.email(input),
  signIn: (input) => authClient.signIn.email(input),
  signOut: () => authClient.signOut(),
}

export const socialSignInPorts: SocialSignInPorts = {
  scheme: APP_SCHEME,
  signInSocial: (input) => authClient.signIn.social(input),
}
