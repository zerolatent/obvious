/**
 * Whether this runtime can perform a WebAuthn ceremony at all.
 *
 * Mirrors `@simplewebauthn/browser`'s own `browserSupportsWebAuthn()` check
 * — the same gate `startRegistration`/`startAuthentication` (called inside
 * Better Auth's passkey client) enforce before ever touching
 * `navigator.credentials` — so a device this returns `true` for is one the
 * ceremony helpers will actually attempt, and one this returns `false` for
 * never sees a passkey button at all (hidden, never shown as broken).
 */
export function isPasskeySupported(): boolean {
  return (
    typeof globalThis.PublicKeyCredential !== "undefined" &&
    typeof globalThis.PublicKeyCredential === "function"
  )
}
