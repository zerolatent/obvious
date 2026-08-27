/**
 * A minimal, pluggable structured logger for the events this package wants
 * observed in production: provider boot/validation failures, rejected OAuth
 * callbacks, rate-limit trips, and password-reset/verification email
 * dispatch. Smaller than Better Auth's own internal `logger` option (which
 * only customizes Better Auth's own diagnostic output) — this is the seam a
 * deployment plugs a real log pipeline (Pino, Datadog, CloudWatch, ...) into
 * via `createAuth({ logger })`.
 *
 * Every call site in this package passes only structured, non-sensitive
 * metadata (ids, sanitized path labels, error codes) — never a token,
 * password, secret, or full request/response body. A logger implementation
 * plugged in here can forward `meta` to a general-purpose log sink as-is.
 */
export interface AuthLogger {
  debug(message: string, meta?: Record<string, unknown>): void
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

/** Canonical order — index comparison is how level filtering works below. */
export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/** Quiet by default: only warnings and failures reach production logs. */
export const DEFAULT_LOG_LEVEL: LogLevel = "warn"

function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value)
}

/**
 * Parse AUTH_LOG_LEVEL. An unset/blank value applies the default; an
 * unrecognized one throws at boot — a typo here should not silently change
 * how loud or quiet production logging is.
 */
export function parseLogLevel(raw: string | undefined): LogLevel {
  const trimmed = (raw ?? "").trim().toLowerCase()
  if (trimmed.length === 0) return DEFAULT_LOG_LEVEL
  if (isLogLevel(trimmed)) return trimmed
  throw new Error(`Unknown AUTH_LOG_LEVEL: "${raw}". Known levels: ${LOG_LEVELS.join(", ")}.`)
}

/**
 * The default logger: leveled `console.*`, tagged so this package's lines are
 * greppable among everything else a server prints. Below the configured
 * level, calls are no-ops rather than filtered after formatting — a
 * high-volume `debug` call costs nothing when the level is `warn`.
 */
export function createConsoleLogger(level: LogLevel = DEFAULT_LOG_LEVEL): AuthLogger {
  const threshold = LOG_LEVELS.indexOf(level)

  const emit =
    (target: LogLevel, sink: (message?: unknown, ...rest: unknown[]) => void) =>
    (message: string, meta?: Record<string, unknown>): void => {
      if (LOG_LEVELS.indexOf(target) < threshold) return
      const tagged = `[auth:${target}] ${message}`
      if (meta && Object.keys(meta).length > 0) {
        sink(tagged, meta)
      } else {
        sink(tagged)
      }
    }

  return {
    debug: emit("debug", console.debug),
    info: emit("info", console.info),
    warn: emit("warn", console.warn),
    error: emit("error", console.error),
  }
}
