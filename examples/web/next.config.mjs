// Which auth server this client's browser code effectively talks to. Both
// requests below are proxied through this Next.js server rather than fetched
// directly from the browser, so the browser only ever sees one origin (this
// app's) no matter which backend AUTH_SERVER_URL names — no client-side CORS
// setup, and no packages/auth change, needed to point this example at a
// different server.
//
// Proxying does NOT by itself satisfy Better Auth's origin check on the
// backend: a Next.js rewrite forwards the browser's original Origin header
// unchanged, so the auth server still sees this app's origin (not its own)
// on every state-changing call (sign-up, sign-in, sign-out) and must
// explicitly trust it — see BETTER_AUTH_TRUSTED_ORIGINS in examples/api's
// .env.example.
const AUTH_SERVER_URL = (process.env.AUTH_SERVER_URL ?? "http://localhost:4000").replace(
  /\/+$/,
  "",
)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Workspace packages ship TypeScript source, not build output.
  transpilePackages: ["@app/auth"],
  async rewrites() {
    return [
      { source: "/api/auth-methods", destination: `${AUTH_SERVER_URL}/api/auth-methods` },
      { source: "/api/auth/:path*", destination: `${AUTH_SERVER_URL}/api/auth/:path*` },
    ]
  },
}

export default nextConfig
