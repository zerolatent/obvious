import { KNOWN_PROVIDERS, type ProviderId } from "@app/auth"

import { AUTH_BASE_URL } from "./config"

export const AUTH_METHODS_PATH = "/api/auth-methods"

/** Pure fetch + parse, kept separate from the screen so it needs no device runtime. */
export async function fetchAuthMethods(): Promise<ProviderId[]> {
  const response = await fetch(`${AUTH_BASE_URL}${AUTH_METHODS_PATH}`, {
    headers: { accept: "application/json" },
  })
  if (!response.ok) {
    throw new Error(`${AUTH_METHODS_PATH} responded ${response.status}`)
  }

  const payload = (await response.json()) as { methods?: unknown }
  if (!Array.isArray(payload.methods)) {
    throw new Error(`${AUTH_METHODS_PATH} returned no "methods" array`)
  }

  const advertised = payload.methods as string[]
  // Filtering the canonical list (rather than mapping the response) pins the
  // render order to the same order the server's registry uses.
  return KNOWN_PROVIDERS.filter((known) => advertised.includes(known))
}
