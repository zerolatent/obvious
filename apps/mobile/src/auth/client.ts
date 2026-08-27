import { createExpoAuthClient } from "@app/auth/expo"
import * as SecureStore from "expo-secure-store"

import { APP_SCHEME, AUTH_BASE_URL } from "./config"

/**
 * The app's single auth client.
 *
 * `packages/auth` owns the plugin wiring; this module owns the two things only
 * the app knows — where the server is and which scheme OAuth returns through —
 * plus the native storage the package deliberately refuses to import itself.
 *
 * Session cookies live in the device keychain/keystore via expo-secure-store.
 * The biometric gate decides whether the app *reveals* that session; it is not
 * a server-side credential (see ./biometricGate).
 */
export const authClient = createExpoAuthClient({
  baseURL: AUTH_BASE_URL,
  scheme: APP_SCHEME,
  storage: SecureStore,
})

export type AuthClient = typeof authClient
