import type { AuthLogger } from "./logging"

/**
 * Replace opaque path segments (a password-reset token) with a fixed
 * placeholder before anything derived from a request path reaches a log
 * line. Provider ids in an OAuth callback path (google/apple) are not
 * sensitive and pass through unchanged.
 */
export function sanitizeAuthPath(pathname: string): string {
  const resetPasswordToken = pathname.match(/^(.*\/reset-password)\/[^/]+$/)
  if (resetPasswordToken) {
    const prefix = resetPasswordToken[1]
    if (prefix) return `${prefix}/:token`
  }
  return pathname
}

export interface RateLimitHitEvent {
  readonly path: string
  readonly method: string
  readonly retryAfterSeconds: number | null
}

/** Better Auth's rate limiter answers a throttled request with a bare 429. */
export function detectRateLimitHit(request: Request, response: Response): RateLimitHitEvent | null {
  if (response.status !== 429) return null
  const retryAfterHeader = response.headers.get("X-Retry-After") ?? response.headers.get("Retry-After")
  return {
    path: sanitizeAuthPath(new URL(request.url).pathname),
    method: request.method,
    retryAfterSeconds: retryAfterHeader ? Number(retryAfterHeader) : null,
  }
}

export interface OAuthCallbackRejectionEvent {
  readonly provider: string
  readonly errorCode: string
}

/**
 * Better Auth's OAuth callback endpoint (`/callback/:provider`) answers
 * every rejection — denied consent, missing/invalid state, an unconfigured
 * provider, account-linking conflicts, mismatched email — with a redirect
 * carrying `?error=<code>`, never a thrown APIError the router's onError
 * hook would see (redirects are deliberately excluded from that hook).
 * Detecting it here, at the response boundary, catches all of those cases
 * uniformly instead of chasing each one through Better Auth's internals.
 */
export function detectOAuthCallbackRejection(
  request: Request,
  response: Response,
): OAuthCallbackRejectionEvent | null {
  const pathname = new URL(request.url).pathname
  const match = pathname.match(/\/callback\/([^/]+)/)
  const provider = match?.[1]
  if (!provider) return null
  if (response.status < 300 || response.status >= 400) return null

  const location = response.headers.get("location")
  if (!location) return null

  const errorCode = new URL(location, request.url).searchParams.get("error")
  if (!errorCode) return null

  return { provider, errorCode }
}

/**
 * Wraps Better Auth's `handler` so the two events above are logged at the
 * single choke point every request already passes through — no per-endpoint
 * hooks to keep in sync with Better Auth's own routing.
 */
export function withRequestLogging(
  handler: (request: Request) => Promise<Response>,
  logger: AuthLogger,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const response = await handler(request)

    const rateLimitHit = detectRateLimitHit(request, response)
    if (rateLimitHit) {
      logger.warn("Rate limit exceeded", { ...rateLimitHit })
    }

    const oauthRejection = detectOAuthCallbackRejection(request, response)
    if (oauthRejection) {
      logger.warn("OAuth callback rejected", { ...oauthRejection })
    }

    return response
  }
}
