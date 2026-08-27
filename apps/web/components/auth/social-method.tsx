"use client"

import { useState } from "react"

import { authClient } from "../../lib/auth-client"
import type { AuthMethodProps } from "./method-registry"

export const SOCIAL_PROVIDERS = ["google", "apple"] as const
export type SocialProviderId = (typeof SOCIAL_PROVIDERS)[number]

export const SOCIAL_LABELS: Record<SocialProviderId, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
}

type StartStatus = "idle" | "starting" | "error"

/**
 * One button per social provider, wired to Better Auth's redirect flow.
 *
 * A successful call never returns control here in a browser: Better Auth's
 * client-side redirect plugin sees `{ url, redirect: true }` in the response
 * and navigates `window.location` to the provider's consent screen as a side
 * effect of the same promise this `await` resolves. So the `error` branch
 * below fires only when the `/sign-in/social` request itself failed —
 * network down, or this deployment never actually mounted the provider —
 * before any redirect could happen.
 *
 * What happens *after* the user reaches the provider (they cancel, or the
 * provider fails) comes back as a full-page navigation to `errorCallbackURL`
 * — a fresh page load, not a promise this component is still around to
 * observe. That outcome is read from the URL by `useOAuthCallbackState` in
 * `AuthMethodsPanel`, not here.
 */
function createSocialMethod(provider: SocialProviderId) {
  function SocialMethod(_props: AuthMethodProps) {
    const [status, setStatus] = useState<StartStatus>("idle")

    async function handleClick() {
      setStatus("starting")
      const { error } = await authClient.signIn.social({
        provider,
        callbackURL: "/",
        errorCallbackURL: window.location.pathname,
      })
      if (error) {
        setStatus("error")
      }
      // No `else`: on success the browser is already navigating away.
    }

    return (
      <div>
        <button type="button" onClick={handleClick} disabled={status === "starting"}>
          {SOCIAL_LABELS[provider]}
        </button>
        {status === "error" && (
          <p role="alert">
            Couldn&apos;t start {SOCIAL_LABELS[provider]}. Check your connection and try again.
          </p>
        )}
      </div>
    )
  }

  SocialMethod.displayName = `SocialMethod(${provider})`
  return SocialMethod
}

export const GoogleMethod = createSocialMethod("google")
export const AppleMethod = createSocialMethod("apple")
