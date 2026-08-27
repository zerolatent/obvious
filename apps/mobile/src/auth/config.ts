import appJson from "../../app.json"

/**
 * Where the mobile client points and how OAuth gets back into the app.
 *
 * The scheme is read from app.json rather than repeated as a literal: the
 * OAuth redirect is `<scheme>://`, so a scheme that drifts from the manifest
 * is a deep link that never returns to the app. One source, asserted by test.
 */
export const APP_SCHEME: string = appJson.expo.scheme

/** Matches BETTER_AUTH_URL's default so a local web server needs no setup. */
export const DEFAULT_AUTH_BASE_URL = "http://localhost:3000"

/** The environment slice the client reads. Expo inlines EXPO_PUBLIC_* at build time. */
export interface MobileAuthEnv {
  EXPO_PUBLIC_AUTH_BASE_URL?: string | undefined
}

/**
 * Resolve the auth server origin the app talks to.
 *
 * Mobile is always cross-origin, so this is required configuration rather than
 * an inferred same-origin default. A malformed value throws at startup: a
 * silently wrong base URL surfaces later as every request failing with no
 * indication that configuration is the cause.
 */
export function resolveAuthBaseURL(env: MobileAuthEnv): string {
  const raw = env.EXPO_PUBLIC_AUTH_BASE_URL?.trim()
  if (!raw) return DEFAULT_AUTH_BASE_URL

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error(`EXPO_PUBLIC_AUTH_BASE_URL is not a valid URL: ${raw}`)
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`EXPO_PUBLIC_AUTH_BASE_URL must be an http(s) URL, got ${parsed.protocol}//`)
  }

  // Trailing slashes would double up when paths are appended.
  return raw.replace(/\/+$/, "")
}

export const AUTH_BASE_URL: string = resolveAuthBaseURL(process.env as MobileAuthEnv)
