import { expoClient } from "@better-auth/expo/client"
import { passkeyClient } from "@better-auth/passkey/client"
import { createAuthClient } from "better-auth/react"

type ExpoClientOptions = Parameters<typeof expoClient>[0]

export interface ExpoAuthClientOptions {
  /** The server's base URL — mobile is always cross-origin. */
  baseURL: string
  /** App scheme used for the OAuth deep-link return. */
  scheme: string
  /**
   * Secure storage for the session cookie. Injected by the app (normally
   * `expo-secure-store`) so this package never imports a native module —
   * importing one here would break the Next.js server bundle.
   */
  storage: ExpoClientOptions["storage"]
  storagePrefix?: string | undefined
}

/** The typed Expo client: secure-store cookies and deep-link OAuth. */
export function createExpoAuthClient(options: ExpoAuthClientOptions) {
  return createAuthClient({
    baseURL: options.baseURL,
    plugins: [
      expoClient({
        scheme: options.scheme,
        storage: options.storage,
        storagePrefix: options.storagePrefix,
      }),
      passkeyClient(),
    ],
  })
}

export type ExpoAuthClient = ReturnType<typeof createExpoAuthClient>
