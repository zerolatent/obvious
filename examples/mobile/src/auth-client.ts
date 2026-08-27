import { createExpoAuthClient } from "@app/auth/expo"
import * as SecureStore from "expo-secure-store"

import { APP_SCHEME, AUTH_BASE_URL } from "./config"

/**
 * `packages/auth` owns the plugin wiring; this app owns the two things only
 * it knows — where the server is and which scheme OAuth returns through —
 * plus the native storage the package deliberately never imports itself.
 */
export const authClient = createExpoAuthClient({
  baseURL: AUTH_BASE_URL,
  scheme: APP_SCHEME,
  storage: SecureStore,
})
