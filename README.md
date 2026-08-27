# Obvious — Pluggable Signup & Login System

pnpm TypeScript monorepo scaffold for a config-driven auth system built on
[Better Auth](https://better-auth.com). This PR lays down the workspace,
shared tooling, and CI; the auth core, providers, and UI land in follow-up PRs
on this release branch.

## Structure

- `apps/web` — Next.js (App Router) web app. Will host the Better Auth server
  at `/api/auth/[...all]`.
- `apps/mobile` — Expo (React Native) mobile client. Talks to the same server.
- `packages/auth` — shared Better Auth instance and provider registry
  (placeholder until the auth-core PR).
- `packages/db` — shared Drizzle schema and database client (placeholder
  until the auth-core PR).

## Getting started

```bash
pnpm install
pnpm dev        # starts the web app (Next.js dev server)
pnpm test       # runs vitest across every workspace
pnpm lint       # eslint across the whole repo
pnpm typecheck  # tsc --noEmit in every workspace
```

Copy `.env.example` to `.env` and set `AUTH_PROVIDERS` (comma-separated:
`email-password`, `google`, `apple`, `passkey`) plus any credentials the
enabled providers need. Flipping a provider on or off is a config change —
it never requires touching flow code.

## CI

Every PR runs lint, typecheck, and vitest (`.github/workflows/ci.yml`), with
a Postgres service container available for the integration tests added by
later PRs.
