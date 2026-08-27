import appJson from "../app.json"

/**
 * The OAuth redirect is `<scheme>://`, so a scheme that drifts from the
 * manifest is a deep link that never returns to the app. Read from app.json
 * rather than repeated as a literal, so there is one source.
 */
export const APP_SCHEME: string = appJson.expo.scheme

/** Matches examples/api's default port so a local server needs no setup. */
export const DEFAULT_AUTH_BASE_URL = "http://localhost:4000"

/**
 * Resolve the auth server origin this app talks to.
 *
 * Mobile is always cross-origin, so this is required configuration rather
 * than an inferred same-origin default. Expo inlines `EXPO_PUBLIC_*` values
 * at build time.
 */
export function resolveAuthBaseURL(raw: string | undefined): string {
  const trimmed = raw?.trim()
  if (!trimmed) return DEFAULT_AUTH_BASE_URL

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new Error(`EXPO_PUBLIC_AUTH_BASE_URL is not a valid URL: ${trimmed}`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`EXPO_PUBLIC_AUTH_BASE_URL must be an http(s) URL, got ${parsed.protocol}//`)
  }

  // Trailing slashes would double up when paths are appended.
  return trimmed.replace(/\/+$/, "")
}

export const AUTH_BASE_URL: string = resolveAuthBaseURL(process.env.EXPO_PUBLIC_AUTH_BASE_URL)
