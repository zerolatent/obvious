/**
 * The biometric gate demo.
 *
 * The governing rule is "never a lockout": a device with no sensor or no
 * enrollment opens straight through, without a prompt. Only a device that can
 * actually prompt is allowed to withhold — and even then a failed attempt is
 * retryable, never a sign-out. That's the one conditional this module exists
 * to demonstrate: `hasHardware && isEnrolled` gates whether we prompt at all.
 */

export type GateDecision =
  | { status: "unlocked"; reason: "no-hardware" | "not-enrolled" | "authenticated" }
  | { status: "locked"; error: string }

export async function evaluateBiometricGate(promptMessage: string): Promise<GateDecision> {
  // Imported lazily so this module can be reasoned about (and its one
  // conditional read) without pulling a native module into non-device tooling.
  const LocalAuthentication = await import("expo-local-authentication")

  const hasHardware = await LocalAuthentication.hasHardwareAsync()
  const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false

  // The single conditional: only prompt when the device can both sense and
  // has something enrolled to check against. Every other case unlocks with no
  // prompt at all — there is nothing to lock the demo behind.
  if (!hasHardware) return { status: "unlocked", reason: "no-hardware" }
  if (!isEnrolled) return { status: "unlocked", reason: "not-enrolled" }

  const result = await LocalAuthentication.authenticateAsync({ promptMessage })
  if (result.success) return { status: "unlocked", reason: "authenticated" }
  return { status: "locked", error: result.error ?? "unknown" }
}
