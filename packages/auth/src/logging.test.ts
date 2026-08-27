import { afterEach, describe, expect, it, vi } from "vitest"

import { createConsoleLogger, DEFAULT_LOG_LEVEL, LOG_LEVELS, parseLogLevel } from "./logging"

describe("parseLogLevel", () => {
  it("defaults to warn when unset or blank", () => {
    expect(parseLogLevel(undefined)).toBe("warn")
    expect(parseLogLevel("")).toBe("warn")
    expect(parseLogLevel("   ")).toBe(DEFAULT_LOG_LEVEL)
  })

  it("accepts every known level, case-insensitively", () => {
    for (const level of LOG_LEVELS) {
      expect(parseLogLevel(level)).toBe(level)
      expect(parseLogLevel(level.toUpperCase())).toBe(level)
    }
  })

  it("trims surrounding whitespace", () => {
    expect(parseLogLevel(" debug ")).toBe("debug")
  })

  it("throws on an unrecognized level rather than silently defaulting", () => {
    expect(() => parseLogLevel("verbose")).toThrowError(/AUTH_LOG_LEVEL/)
  })
})

describe("createConsoleLogger", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("suppresses calls below the configured level", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    const logger = createConsoleLogger("warn")

    logger.info("should not print")
    logger.warn("should print")

    expect(infoSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })

  it("passes structured meta through to the underlying console call", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const logger = createConsoleLogger("error")

    logger.error("boom", { userId: "u1" })

    expect(errorSpy).toHaveBeenCalledWith("[auth:error] boom", { userId: "u1" })
  })

  it("omits the meta argument entirely when none is given", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const logger = createConsoleLogger("error")

    logger.error("boom")

    expect(errorSpy).toHaveBeenCalledWith("[auth:error] boom")
  })

  it("defaults to warn level", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {})
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {})
    const logger = createConsoleLogger()

    logger.debug("quiet")
    logger.warn("loud")

    expect(debugSpy).not.toHaveBeenCalled()
    expect(warnSpy).toHaveBeenCalledTimes(1)
  })
})
