export {
  KNOWN_PROVIDERS,
  DEFAULT_PROVIDERS,
  parseProviders,
  parseBooleanEnv,
  parseRequireEmailVerification,
  createProviderRegistry,
  authMethodsResponse,
  type ProviderId,
  type ProviderRegistry,
  type AuthMethodsResponse,
} from "./config"

export {
  CONSOLE_MAILER_BANNER,
  createConsoleMailer,
  emailVerificationMail,
  passwordResetMail,
  type ConsoleMailerOptions,
  type Mailer,
  type OutgoingMail,
} from "./mailer"

export {
  accountLinkingConfig,
  createAuth,
  emailAndPasswordConfig,
  emailVerificationConfig,
  mountedRoutes,
  pluginsFor,
  socialProvidersFor,
  type AuthEnv,
  type AuthInstance,
  type CreateAuthOptions,
} from "./server"

export { createWebAuthClient, type WebAuthClient, type WebAuthClientOptions } from "./client"

export {
  createConsoleLogger,
  DEFAULT_LOG_LEVEL,
  LOG_LEVELS,
  parseLogLevel,
  type AuthLogger,
  type LogLevel,
} from "./logging"

export {
  DEFAULT_RATE_LIMIT_MAX,
  DEFAULT_RATE_LIMIT_WINDOW_SECONDS,
  parseRateLimitConfig,
  rateLimitCustomRules,
  rateLimitOptionsFor,
  type RateLimitConfig,
} from "./rate-limit"

export {
  detectOAuthCallbackRejection,
  detectRateLimitHit,
  sanitizeAuthPath,
  withRequestLogging,
  type OAuthCallbackRejectionEvent,
  type RateLimitHitEvent,
} from "./request-events"

export { wrapEmailDispatch } from "./email-dispatch"
