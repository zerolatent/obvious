# examples/web

A minimal Next.js (App Router) client for the modular auth system. One page:
it fetches the enabled sign-in methods, renders only those, and lets you sign
in, see the session, and sign out — using `@app/auth/client` like `apps/web`
does, but a fraction of the surface.

Plain CSS-free markup, no UI kit — this is a wiring example, not a design one.

## Run it

This app has no auth server of its own — it proxies to one. Start
[`examples/api`](../api) (or `apps/web`) first, then:

```sh
cp .env.example .env   # AUTH_SERVER_URL defaults to examples/api on :4000
bun run --filter @example/web dev
```

Open http://localhost:3001. `/api/auth/*` and `/api/auth-methods` are
rewritten by `next.config.mjs` to whichever server `AUTH_SERVER_URL` names, so
the browser only ever talks to this app's own origin — see the comment in
`next.config.mjs` for why (Better Auth's origin check).

The rewrite forwards the browser's `Origin` header unchanged, so the auth
server still sees `http://localhost:3001` on every state-changing call and
must trust it explicitly. `examples/api`'s `.env.example` sets
`BETTER_AUTH_TRUSTED_ORIGINS=http://localhost:3001` by default for exactly
this; if you point this app at `apps/web` instead, add that origin there too.

## Point it at a different server

Change `AUTH_SERVER_URL` in `.env` to `apps/web`'s origin (typically
`http://localhost:3000`) and restart. No code change.

## The flip-test

1. With `examples/api` running under `AUTH_PROVIDERS=email-password`, load
   this app: only the email/password form renders.
2. Stop `examples/api`, set `AUTH_PROVIDERS=email-password,passkey`, restart
   it, and reload this page: the passkey button now renders too — with zero
   changes to any file in this app.

See the root README's provider guide for the full set of `AUTH_PROVIDERS`
values and what each one needs configured.
