import { describe, expect, it, vi } from "vitest"

import { wrapEmailDispatch } from "./email-dispatch"
import type { AuthLogger } from "./logging"

function fakeLogger(): AuthLogger {
  return { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}

describe("wrapEmailDispatch", () => {
  it("logs an info on dispatch and forwards the call to the real sender", async () => {
    const logger = fakeLogger()
    const send = vi.fn(async () => {})
    const wrapped = wrapEmailDispatch("password-reset", send, logger)

    await wrapped({ user: { id: "user-1" } })

    expect(send).toHaveBeenCalledWith({ user: { id: "user-1" } }, undefined)
    expect(logger.info).toHaveBeenCalledWith("Dispatching password-reset email", {
      userId: "user-1",
    })
    expect(logger.warn).not.toHaveBeenCalled()
  })

  it("logs a warn and rethrows when the sender fails, without swallowing the error", async () => {
    const logger = fakeLogger()
    const send = vi.fn(async () => {
      throw new Error("SMTP connection refused")
    })
    const wrapped = wrapEmailDispatch("email-verification", send, logger)

    await expect(wrapped({ user: { id: "user-2" } })).rejects.toThrowError(
      "SMTP connection refused",
    )
    expect(logger.warn).toHaveBeenCalledWith("Failed to dispatch email-verification email", {
      userId: "user-2",
      error: "SMTP connection refused",
    })
  })

  it("never includes the email address or a token in logged metadata", async () => {
    const logger = fakeLogger()
    const send = vi.fn(async () => {})
    const wrapped = wrapEmailDispatch("password-reset", send, logger)

    await wrapped({
      user: { id: "user-3", email: "person@example.com" },
      url: "https://example.com/reset?token=super-secret",
    } as { user: { id: string; email: string }; url: string })

    const infoCall = (logger.info as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(infoCall?.[1]).toEqual({ userId: "user-3" })
  })
})
