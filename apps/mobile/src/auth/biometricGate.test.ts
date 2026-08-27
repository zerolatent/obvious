import { describe, expect, it, vi } from "vitest"

import {
  evaluateBiometricGate,
  openStoredSession,
  UNLOCK_PROMPT,
  type BiometricAuthenticator,
} from "./biometricGate"

/**
 * The gate is the one place where a wrong answer either exposes a session or
 * locks a paying user out of their account, so every device shape it can meet
 * is asserted here rather than checked by hand on a phone.
 */

function authenticator(overrides: Partial<BiometricAuthenticator> = {}): BiometricAuthenticator {
  return {
    hasHardwareAsync: vi.fn(async () => true),
    isEnrolledAsync: vi.fn(async () => true),
    authenticateAsync: vi.fn(async () => ({ success: true })),
    ...overrides,
  }
}

describe("evaluateBiometricGate", () => {
  it("unlocks without prompting when the device has no sensor", async () => {
    const authenticateAsync = vi.fn(async () => ({ success: false, error: "unreachable" }))
    const decision = await evaluateBiometricGate(
      authenticator({ hasHardwareAsync: async () => false, authenticateAsync }),
    )

    expect(decision).toEqual({ status: "unlocked", reason: "no-hardware" })
    expect(authenticateAsync).not.toHaveBeenCalled()
  })

  it("unlocks without prompting when nothing is enrolled", async () => {
    const authenticateAsync = vi.fn(async () => ({ success: false, error: "unreachable" }))
    const decision = await evaluateBiometricGate(
      authenticator({ isEnrolledAsync: async () => false, authenticateAsync }),
    )

    expect(decision).toEqual({ status: "unlocked", reason: "not-enrolled" })
    expect(authenticateAsync).not.toHaveBeenCalled()
  })

  it("unlocks when capability probing throws, rather than stranding the user", async () => {
    const decision = await evaluateBiometricGate(
      authenticator({
        hasHardwareAsync: async () => {
          throw new Error("native module unavailable")
        },
      }),
    )

    expect(decision).toEqual({ status: "unlocked", reason: "unavailable" })
  })

  it("unlocks when the user passes the prompt", async () => {
    const authenticateAsync = vi.fn(async () => ({ success: true }))
    const decision = await evaluateBiometricGate(authenticator({ authenticateAsync }))

    expect(decision).toEqual({ status: "unlocked", reason: "authenticated" })
    expect(authenticateAsync).toHaveBeenCalledWith({ promptMessage: UNLOCK_PROMPT })
  })

  it("locks when the prompt fails, carrying the reason", async () => {
    const decision = await evaluateBiometricGate(
      authenticator({ authenticateAsync: async () => ({ success: false, error: "user_cancel" }) }),
    )

    expect(decision).toEqual({ status: "locked", reason: "failed", error: "user_cancel" })
  })

  it("locks when the prompt itself throws — a device that can ask, and did not get a yes", async () => {
    const decision = await evaluateBiometricGate(
      authenticator({
        authenticateAsync: async () => {
          throw new Error("sensor busy")
        },
      }),
    )

    expect(decision).toEqual({ status: "locked", reason: "failed", error: "sensor busy" })
  })

  it("passes a caller-supplied prompt message through to the sensor", async () => {
    const authenticateAsync = vi.fn(async () => ({ success: true }))
    await evaluateBiometricGate(authenticator({ authenticateAsync }), "Unlock Obvious")

    expect(authenticateAsync).toHaveBeenCalledWith({ promptMessage: "Unlock Obvious" })
  })
})

describe("openStoredSession", () => {
  it("never prompts when there is no stored session to reveal", async () => {
    const authenticateAsync = vi.fn(async () => ({ success: true }))
    const state = await openStoredSession({
      hasStoredSession: false,
      authenticator: authenticator({ authenticateAsync }),
    })

    expect(state).toEqual({ status: "signed-out" })
    expect(authenticateAsync).not.toHaveBeenCalled()
  })

  it("reveals the stored session after a successful prompt", async () => {
    const state = await openStoredSession({
      hasStoredSession: true,
      authenticator: authenticator(),
    })

    expect(state).toEqual({ status: "unlocked", reason: "authenticated" })
  })

  it("reveals the stored session on a device that cannot prompt at all", async () => {
    const state = await openStoredSession({
      hasStoredSession: true,
      authenticator: authenticator({ hasHardwareAsync: async () => false }),
    })

    // The lockout case the gate exists to avoid: no sensor must never mean no
    // account.
    expect(state).toEqual({ status: "unlocked", reason: "no-hardware" })
  })

  it("keeps a failed unlock retryable instead of signing the user out", async () => {
    const state = await openStoredSession({
      hasStoredSession: true,
      authenticator: authenticator({
        authenticateAsync: async () => ({ success: false, error: "no_match" }),
      }),
    })

    expect(state).toEqual({ status: "locked", error: "no_match", retryable: true })
  })

  it("unlocks on a retry after an earlier failure, with the session still stored", async () => {
    const authenticateAsync = vi
      .fn<() => Promise<{ success: boolean; error?: string }>>()
      .mockResolvedValueOnce({ success: false, error: "no_match" })
      .mockResolvedValueOnce({ success: true })
    const gate = authenticator({ authenticateAsync })

    const first = await openStoredSession({ hasStoredSession: true, authenticator: gate })
    const second = await openStoredSession({ hasStoredSession: true, authenticator: gate })

    expect(first.status).toBe("locked")
    expect(second).toEqual({ status: "unlocked", reason: "authenticated" })
  })
})
