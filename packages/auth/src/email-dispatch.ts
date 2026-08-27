import type { AuthLogger } from "./logging"

type EmailDispatchKind = "password-reset" | "email-verification"

interface EmailDispatchData {
  user: { id: string }
}

/**
 * Wraps a deployment-supplied email sender so every dispatch attempt is
 * observable — info when attempted, warn (plus rethrow, so Better Auth's own
 * error handling still applies) when it fails — without ever logging the
 * token, the URL it is embedded in, or the address the message goes to.
 */
export function wrapEmailDispatch<Data extends EmailDispatchData>(
  kind: EmailDispatchKind,
  send: (data: Data, request?: Request) => Promise<void>,
  logger: AuthLogger,
): (data: Data, request?: Request) => Promise<void> {
  return async (data, request) => {
    logger.info(`Dispatching ${kind} email`, { userId: data.user.id })
    try {
      await send(data, request)
    } catch (error) {
      logger.warn(`Failed to dispatch ${kind} email`, {
        userId: data.user.id,
        error: error instanceof Error ? error.message : String(error),
      })
      throw error
    }
  }
}
