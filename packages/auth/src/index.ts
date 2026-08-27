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
