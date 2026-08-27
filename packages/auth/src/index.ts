export {
  KNOWN_PROVIDERS,
  DEFAULT_PROVIDERS,
  parseProviders,
  createProviderRegistry,
  authMethodsResponse,
  type ProviderId,
  type ProviderRegistry,
  type AuthMethodsResponse,
} from "./config"

export {
  createAuth,
  mountedRoutes,
  pluginsFor,
  socialProvidersFor,
  type AuthEnv,
  type AuthInstance,
  type CreateAuthOptions,
} from "./server"

export { createWebAuthClient, type WebAuthClient, type WebAuthClientOptions } from "./client"
