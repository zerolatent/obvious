import { describe, expect, it, vi } from "vitest"

import { APP_SCHEME } from "./config"
import {
  deepLinkCallbackURL,
  isSocialProvider,
  signInWithSocialProvider,
  type SocialSignInPorts,
} from "./socialSignIn"

/**
 * The OAuth hop is the integration's job; what is asserted here is the part we
 * own — that the provider leaves through the system browser with a callback
 * pointing at this app's scheme, and that each way the hop can end is
 * distinguished (returned, cancelled, failed).
 */

/**
 * Stands in for @better-auth/expo: opens the "browser", and returns whatever
 * the fake provider redirects back with. A redirect that does not target the
 * app scheme is a link the OS would never route home, so it fails loudly.
 */
function fakeBrowserFlow(
  outcome: { type: "redirect" } | { type: "dismiss" } | { type: "error"; message: string },
) {
  const opened: string[] = []
  const signInSocial = vi.fn(async ({ callbackURL }: { callbackURL: string }) => {
    opened.push(callbackURL)
    if (outcome.type === "dismiss") return { error: { code: "USER_CANCELLED" } }
    if (outcome.type === "error") return { error: { message: outcome.message } }

    if (!callbackURL.startsWith(`${APP_SCHEME}://`)) {
      throw new Error(`provider cannot redirect to ${callbackURL}`)
    }
    return {}
  })

  return { opened, ports: { scheme: APP_SCHEME, signInSocial } satisfies SocialSignInPorts }
}

describe("deepLinkCallbackURL", () => {
  it("builds an app-scheme URL from the manifest scheme", () => {
    expect(deepLinkCallbackURL("obvious-auth")).toBe("obvious-auth://")
    expect(deepLinkCallbackURL("obvious-auth", "/signed-in")).toBe("obvious-auth://signed-in")
  })
})

describe("isSocialProvider", () => {
  it("recognises exactly the providers this app can present", () => {
    expect(isSocialProvider("google")).toBe(true)
    expect(isSocialProvider("apple")).toBe(true)
    expect(isSocialProvider("email-password")).toBe(false)
    expect(isSocialProvider("passkey")).toBe(false)
  })
})

describe("signInWithSocialProvider", () => {
  it("sends Google through the browser with a callback into this app", async () => {
    const { opened, ports } = fakeBrowserFlow({ type: "redirect" })

    const outcome = await signInWithSocialProvider("google", ports)

    expect(outcome).toEqual({ status: "success" })
    expect(ports.signInSocial).toHaveBeenCalledWith({
      provider: "google",
      callbackURL: `${APP_SCHEME}://`,
    })
    expect(opened).toEqual([`${APP_SCHEME}://`])
  })

  it("sends Apple through the same flow, to a caller-chosen return path", async () => {
    const { ports } = fakeBrowserFlow({ type: "redirect" })

    const outcome = await signInWithSocialProvider("apple", ports, "/signed-in")

    expect(outcome).toEqual({ status: "success" })
    expect(ports.signInSocial).toHaveBeenCalledWith({
      provider: "apple",
      callbackURL: `${APP_SCHEME}://signed-in`,
    })
  })

  it("treats a dismissed browser as a cancellation, not an error", async () => {
    const { ports } = fakeBrowserFlow({ type: "dismiss" })

    expect(await signInWithSocialProvider("google", ports)).toEqual({ status: "cancelled" })
  })

  it("treats a cancellation-shaped throw as a cancellation too", async () => {
    const ports: SocialSignInPorts = {
      scheme: APP_SCHEME,
      signInSocial: async () => {
        throw new Error("The user canceled the authentication session")
      },
    }

    expect(await signInWithSocialProvider("apple", ports)).toEqual({ status: "cancelled" })
  })

  it("names the provider when the hop fails, keeping the server's detail", async () => {
    const { ports } = fakeBrowserFlow({ type: "error", message: "provider not enabled" })

    expect(await signInWithSocialProvider("google", ports)).toEqual({
      status: "error",
      message: "Google sign-in failed: provider not enabled",
    })
  })

  it("reports a thrown transport failure instead of swallowing it", async () => {
    const ports: SocialSignInPorts = {
      scheme: APP_SCHEME,
      signInSocial: async () => {
        throw new Error("Network request failed")
      },
    }

    expect(await signInWithSocialProvider("apple", ports)).toEqual({
      status: "error",
      message: "Apple sign-in failed: Network request failed",
    })
  })
})
