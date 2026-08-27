/**
 * The mobile biometric gate.
 *
 * The session itself lives in expo-secure-store via @better-auth/expo —
 * biometrics decide whether the app *reveals* it. The server never sees a
 * biometric credential.
 *
 * The governing rule is "never a lockout": a device with no sensor, no
 * enrollment, or a sensor that errors on capability probing opens the session
 * without a prompt. Only a device that can actually prompt is allowed to
 * withhold the session, and even then the session survives — a failed attempt
 * is retryable, never a sign-out.
 */

/**
 * The slice of expo-local-authentication the gate needs, as a port. Injecting
 * it keeps the policy below testable in plain Node: the native module cannot
 * be loaded outside a device runtime, and a gate this consequential should not
 * be verified only by hand on a phone.
 */
export interface BiometricAuthenticator {
  hasHardwareAsync(): Promise<boolean>
  isEnrolledAsync(): Promise<boolean>
  authenticateAsync(options: {
    promptMessage: string
    cancelLabel?: string
    disableDeviceFallback?: boolean
  }): Promise<{ success: boolean; error?: string; warning?: string }>
}

/** Binds the port to the real device sensors. */
export async function expoBiometricAuthenticator(): Promise<BiometricAuthenticator> {
  // Imported lazily so importing this module — for its policy — never pulls a
  // native module into a non-device runtime (tests, tooling).
  const LocalAuthentication = await import("expo-local-authentication")
  return {
    hasHardwareAsync: () => LocalAuthentication.hasHardwareAsync(),
    isEnrolledAsync: () => LocalAuthentication.isEnrolledAsync(),
    authenticateAsync: (options) => LocalAuthentication.authenticateAsync(options),
  }
}

export const UNLOCK_PROMPT = "Unlock your session"

export type UnlockReason =
  /** No sensor on this device. */
  | "no-hardware"
  /** Sensor present, nothing enrolled. */
  | "not-enrolled"
  /** The sensor could not be interrogated; treated as no biometrics. */
  | "unavailable"
  /** The user passed the prompt. */
  | "authenticated"

export type GateDecision =
  | { status: "unlocked"; reason: UnlockReason }
  | { status: "locked"; reason: "failed"; error: string }

/**
 * Decide whether the stored session may be revealed.
 *
 * Capability probing that throws resolves to `unlocked` for the same reason a
 * missing sensor does: the alternative is a user who can never reach their
 * account because a native call failed. A prompt that runs and fails resolves
 * to `locked` — the device could ask, and the answer was no.
 */
export async function evaluateBiometricGate(
  authenticator: BiometricAuthenticator,
  promptMessage: string = UNLOCK_PROMPT,
): Promise<GateDecision> {
  let hasHardware: boolean
  let isEnrolled: boolean
  try {
    hasHardware = await authenticator.hasHardwareAsync()
    if (!hasHardware) return { status: "unlocked", reason: "no-hardware" }
    isEnrolled = await authenticator.isEnrolledAsync()
  } catch {
    return { status: "unlocked", reason: "unavailable" }
  }

  if (!isEnrolled) return { status: "unlocked", reason: "not-enrolled" }

  let result: Awaited<ReturnType<BiometricAuthenticator["authenticateAsync"]>>
  try {
    result = await authenticator.authenticateAsync({ promptMessage })
  } catch (error) {
    // The prompt itself blew up. The device *can* prompt, so this is a locked
    // state the user retries — not a reason to hand over the session.
    return { status: "locked", reason: "failed", error: describeError(error) }
  }

  if (result.success) return { status: "unlocked", reason: "authenticated" }
  return { status: "locked", reason: "failed", error: result.error ?? "unknown" }
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export type SessionGateState =
  /** Nothing stored to reveal — show the sign-in methods, never a prompt. */
  | { status: "signed-out" }
  | { status: "unlocked"; reason: UnlockReason }
  /** Session intact in secure storage; the user may retry the prompt. */
  | { status: "locked"; error: string; retryable: true }

export interface OpenStoredSessionOptions {
  /** Whether @better-auth/expo has a session cookie in secure storage. */
  hasStoredSession: boolean
  authenticator: BiometricAuthenticator
  promptMessage?: string
}

/**
 * The gate as the app applies it on open: prompt only when there is something
 * to reveal, and never let a failed prompt destroy the stored session.
 */
export async function openStoredSession(
  options: OpenStoredSessionOptions,
): Promise<SessionGateState> {
  if (!options.hasStoredSession) return { status: "signed-out" }

  const decision = await evaluateBiometricGate(options.authenticator, options.promptMessage)
  if (decision.status === "unlocked") return { status: "unlocked", reason: decision.reason }
  return { status: "locked", error: decision.error, retryable: true }
}
