import type { ProviderId } from "@app/auth"

import type { AuthActionResult } from "./emailPassword"

/**
 * Google and Apple sign-in on mobile.
 *
 * The hop itself belongs to @better-auth/expo: it opens the provider consent
 * page in the system browser and catches the `<scheme>://` redirect back into
 * the app, storing the returned session in expo-secure-store. This module owns
 * the two things the integration cannot decide for us — the deep link the
 * provider must return to, and what the user sees for each way the hop can end.
 */

export const SOCIAL_PROVIDERS = ["google", "apple"] as const

export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]

export function isSocialProvider(id: ProviderId): id is SocialProviderId {
  return (SOCIAL_PROVIDERS as readonly string[]).includes(id)
}

/**
 * The app-scheme URL the OAuth callback redirects to.
 *
 * Built from the scheme in app.json, so the URL registered with the OS and the
 * URL handed to the provider cannot disagree.
 */
export function deepLinkCallbackURL(scheme: string, path = "/"): string {
  return `${scheme}://${path.replace(/^\/+/, "")}`
}

export interface SocialSignInPorts {
  signInSocial(input: {
    provider: SocialProviderId
    callbackURL: string
  }): Promise<AuthActionResult>
  scheme: string
}

export type SocialSignInOutcome =
  | { status: "success" }
  /** The user backed out of consent — the sign-in screen is unchanged. */
  | { status: "cancelled" }
  | { status: "error"; message: string }

/** Error codes @better-auth/expo surfaces when the browser session is dismissed. */
const CANCELLED_CODES = new Set(["USER_CANCELLED", "USER_CANCELED", "CANCELLED", "DISMISSED"])
const CANCELLED_PATTERN = /cancel|dismiss/i

function isCancellation(error: {
  message?: string | undefined
  code?: string | undefined
}): boolean {
  if (error.code && CANCELLED_CODES.has(error.code)) return true
  return error.message !== undefined && CANCELLED_PATTERN.test(error.message)
}

export async function signInWithSocialProvider(
  provider: SocialProviderId,
  ports: SocialSignInPorts,
  callbackPath = "/",
): Promise<SocialSignInOutcome> {
  let result: AuthActionResult
  try {
    result = await ports.signInSocial({
      provider,
      callbackURL: deepLinkCallbackURL(ports.scheme, callbackPath),
    })
  } catch (error) {
    // A throw from the browser hop is indistinguishable from a dismissal on
    // some platforms; treat a cancellation-shaped throw as a cancellation so a
    // user who changed their mind is not shown an error.
    const message = error instanceof Error ? error.message : String(error)
    if (CANCELLED_PATTERN.test(message)) return { status: "cancelled" }
    return { status: "error", message: describeProviderFailure(provider, message) }
  }

  if (result.error) {
    if (isCancellation(result.error)) return { status: "cancelled" }
    return {
      status: "error",
      message: describeProviderFailure(provider, result.error.message),
    }
  }

  return { status: "success" }
}

function describeProviderFailure(provider: SocialProviderId, detail?: string): string {
  const name = provider === "google" ? "Google" : "Apple"
  // The detail is kept: "provider down" and "not enabled here" need different
  // reactions from the user, and the other methods remain available either way.
  return detail ? `${name} sign-in failed: ${detail}` : `${name} sign-in failed. Try again.`
}
