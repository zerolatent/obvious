# examples/api

A headless Better Auth server: `createAuth()` from `@app/auth` mounted over a
bare `node:http` server, no web framework. Useful as a starting point for a
mobile-only product or a service that only needs the auth backend.

## Run it

```sh
cp .env.example .env   # then fill in DATABASE_URL and BETTER_AUTH_SECRET
bun run --filter @app/db db:migrate   # once, against that DATABASE_URL
bun run --filter @example/api dev
```

The server listens on `PORT` (default `4000`) and exposes:

- `GET /api/auth-methods` — the enabled provider list, derived from
  `AUTH_PROVIDERS` via the same `authMethodsResponse`/registry that
  `apps/web` uses. This is the contract every example client renders from.
- Every path Better Auth mounts (`/api/auth/*`): sign-up, sign-in, sign-out,
  session, social callbacks, passkeys — whichever `AUTH_PROVIDERS` enables.

## Try the round trip

```sh
curl -s -X POST http://localhost:4000/api/auth/sign-up/email \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123","name":"Demo"}'

curl -s -X POST http://localhost:4000/api/auth/sign-in/email \
  -H 'content-type: application/json' \
  -d '{"email":"demo@example.com","password":"password123"}'
```

## Flip which methods are enabled

Change `AUTH_PROVIDERS` in `.env` (e.g. drop `passkey`, add `google`) and
restart. `GET /api/auth-methods` reflects the new set immediately — no code
change in this server or in any client pointed at it.

## Pointing a client here

Both `examples/web` and `examples/mobile` can run against this server. See
their READMEs for the environment variable that selects it.

`examples/web` proxies browser requests through its own Next.js server, but
that proxy forwards the browser's original `Origin` header unchanged, so this
server still sees `http://localhost:3001` (not its own origin) on every
state-changing call. `BETTER_AUTH_TRUSTED_ORIGINS` in `.env.example` is set to
that origin by default so sign-up/sign-in/sign-out work out of the box; adjust
it (comma-separated) if you run `examples/web` on a different port.
