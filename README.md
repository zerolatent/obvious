# Obvious — Pluggable Signup & Login System

A config-driven auth system built on [Better Auth](https://better-auth.com):
one server contract, a Next.js web client and an Expo mobile client, and a
provider registry that turns a single environment variable into what the API
mounts and what the UI renders. Enabling or disabling a login method is a
config change — it never touches flow code. See the
[spec](https://app.obvious.ai/p/modular-authentication-system-llZSGqVQ) for
the full design rationale.

## How it works

Everything hangs off one config source: `AUTH_PROVIDERS`, a comma-separated
list validated at boot (`packages/auth/src/config.ts`). The provider registry
built from it decides three things, all from the same object, so they can
never drift from each other:

1. **What the Better Auth server mounts** (`packages/auth/src/server.ts`) —
   `emailAndPassword.enabled`, the `socialProviders` fragment for Google/Apple,
   and whether the `passkey` plugin is in the plugin list.
2. **What `GET /api/auth-methods` reports** (`apps/web/app/api/auth-methods/route.ts`)
   — `{ "methods": [...] }`, derived from `registry.enabled`.
3. **What the UI renders** — both `apps/web` (`components/auth/method-registry.tsx`)
   and `apps/mobile` (`src/auth/methods.ts`) fetch `/api/auth-methods` and
   render only what comes back. A disabled method is not just hidden, it's
   unreachable: the API rejects it (`PROVIDER_NOT_FOUND` /
   `EMAIL_PASSWORD_SIGN_UP_DISABLED`) even if a client were to call it directly.

An unknown id in `AUTH_PROVIDERS` throws at boot rather than silently
disabling a login method in production.

### Enabling / disabling a provider

Set `AUTH_PROVIDERS` to any subset of `email-password`, `google`, `apple`,
`passkey` (default: `email-password`). No other change is required:

```bash
AUTH_PROVIDERS=email-password                     # default
AUTH_PROVIDERS=google,apple                       # social-only deployment
AUTH_PROVIDERS=email-password,google,apple,passkey # everything on
```

Restart the server after changing it — `AUTH_PROVIDERS` is read once, at
`createAuth()` construction.

### Required environment variables

Copy `.env.example` to `.env` and fill in what your enabled providers need.

| Variable | Required when | Read by |
|---|---|---|
| `BETTER_AUTH_URL` | Always | `packages/auth/src/server.ts` (`baseURL`, OAuth redirect construction) |
| `BETTER_AUTH_SECRET` | Always | `packages/auth/src/server.ts` (`secret`) |
| `AUTH_PROVIDERS` | Always (defaults to `email-password` if unset) | `packages/auth/src/config.ts` |
| `DATABASE_URL` | Always | `packages/db/src/client.ts` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | `google` in `AUTH_PROVIDERS` | `packages/auth/src/server.ts` (`socialProvidersFor`) |
| `APPLE_CLIENT_ID`, `APPLE_CLIENT_SECRET`, `APPLE_BUNDLE_ID` | `apple` in `AUTH_PROVIDERS` | `packages/auth/src/server.ts` (`socialProvidersFor`) |
| `AUTH_REQUIRE_EMAIL_VERIFICATION` | Optional (defaults to `false`) | `packages/auth/src/config.ts` (`parseRequireEmailVerification`) — when true, an account with an unproven email address cannot be issued a session. Accepts `1/true/yes/on` and `0/false/no/off`; anything else throws at boot |
| `MOBILE_APP_SCHEME` | Optional (defaults to `obvious-auth`, matching `apps/mobile/app.json`'s `expo.scheme`) | `packages/auth/src/server.ts` (`mobileTrustedOrigins`) — trusts the mobile app's deep-link scheme as an OAuth callback origin |
| `EXPO_PUBLIC_AUTH_BASE_URL` | Optional, mobile only (defaults to `http://localhost:3000`) | `apps/mobile/src/auth/config.ts` — where the mobile client points |

`GOOGLE_CLIENT_ID`/`SECRET` and `APPLE_CLIENT_ID`/`SECRET`/`APPLE_BUNDLE_ID`
are enforced at boot: enabling `google` or `apple` in `AUTH_PROVIDERS`
without the matching credentials throws immediately
(`Auth provider "google" is enabled via AUTH_PROVIDERS but GOOGLE_CLIENT_ID is not set.`)
rather than mounting a half-configured provider.

## Password reset & email verification

Both flows are mail-driven, and mail delivery is a seam rather than a
dependency. `packages/auth/src/mailer.ts` defines the whole contract:

```ts
interface OutgoingMail { to: string; subject: string; text: string; html: string }
interface Mailer { sendMail(mail: OutgoingMail): Promise<void> }
```

No SMTP client or provider SDK ships in this repo. Delivery has a different
right answer at every deployment, so the interface is what's provided and the
adapter is yours — roughly ten lines against any provider:

```ts
import { Resend } from "resend"
import { createAuth, type Mailer } from "@app/auth"

const resend = new Resend(process.env.RESEND_API_KEY)

const mailer: Mailer = {
  async sendMail({ to, subject, text, html }) {
    // Throwing here surfaces the failure in the auth request that caused it,
    // which is the point: a reset email that silently vanished looks, to the
    // user, exactly like one that was never requested.
    const { error } = await resend.emails.send({ from: "auth@example.com", to, subject, text, html })
    if (error) throw new Error(`Reset/verification email failed: ${error.message}`)
  },
}

export const { auth } = createAuth({ mailer })
```

SendGrid (`sgMail.send`), SES (`SendEmailCommand`), Postmark, Nodemailer, or
an internal queue all fit the same shape.

**The default is a console mailer, and it is for development only.** With no
`mailer` passed, `createAuth()` prints each message — action link included —
to the server log behind a `DEV ONLY — no email was sent` banner, so a fresh
clone can walk the entire reset round-trip with zero credentials configured.
In production it would do exactly two unwanted things: send nothing, and
write live reset tokens into your log stream. Pass a real `mailer` before you
deploy.

### The flows

Both are Better Auth's own routes; this package supplies the callbacks that
make them work.

- **Reset** — `POST /api/auth/request-password-reset` `{ email }` mails a link
  to `/api/auth/reset-password/<token>`; `POST /api/auth/reset-password`
  `{ token, newPassword }` completes it. The token is single-use, valid for an
  hour. An unknown address gets the same response as a known one and mails
  nobody. Reset is wired **only** when `email-password` is in `AUTH_PROVIDERS`
  — on a social-only deployment the endpoint answers `RESET_PASSWORD_DISABLED`,
  because a login method that is turned off must not be resettable.
- **Verification** — `GET /api/auth/verify-email?token=...` marks the address
  proven. `POST /api/auth/send-verification-email` re-sends on demand.

### `AUTH_REQUIRE_EMAIL_VERIFICATION`

Off by default, which preserves existing behavior exactly: no verification
mail on signup, and unverified users log in normally.

Turned on, signup mails a verification link and sign-in with correct
credentials for an unverified account returns `403 EMAIL_NOT_VERIFIED` with no
session. Note that this is a *distinct* error rather than the generic
"Incorrect email or password." the login form shows otherwise. That is
deliberate: Better Auth runs the verification check **after** the password
check, so the only caller who can ever see `EMAIL_NOT_VERIFIED` already holds
the correct credentials and learns nothing about who else has an account.
Collapsing it into the generic error would buy no enumeration resistance and
would leave a legitimate user staring at "incorrect password" for a password
that is correct. Enumeration resistance at the boundary that matters is
unchanged and still tested: a wrong password and an unknown account return
identical responses.

Turning this on is a breaking change for a deployment that already has
unverified users — they are all locked out until they click a link — so it is
an explicit opt-in, never a default.

## Running web + mobile against the server

The Better Auth server lives inside the Next.js app at
`/api/auth/[...all]`; the mobile client talks to the same instance over
HTTP, so start the web app first.

```bash
bun install
cp .env.example .env   # fill in BETTER_AUTH_SECRET, DATABASE_URL, provider credentials
bun dev                 # apps/web — Next.js dev server on :3000
```

In a second terminal, for the mobile client:

```bash
cd apps/mobile
EXPO_PUBLIC_AUTH_BASE_URL=http://localhost:3000 bun dev   # expo start --clear
```

Point a simulator/device or Expo Go at the printed Metro URL. `EXPO_PUBLIC_AUTH_BASE_URL`
defaults to `http://localhost:3000`, which matches the web app's default port,
so it can be omitted for local same-machine development; set it explicitly
when the server isn't on `localhost` (a physical device, a tunnel, staging).

Database: `DATABASE_URL` must point at a reachable Postgres instance before
either app can serve authenticated requests (`packages/db` opens the
connection lazily, on first use).

## Examples

`examples/` has three minimal, runnable sample apps that import the real
`@app/auth`/`@app/db` workspace packages (never copies): a headless
`examples/api` server, a `examples/web` Next.js client, and a `examples/mobile`
Expo client. They're a smaller surface than `apps/*` for learning the wiring
or bootstrapping a new deployment — see each example's own README for run
instructions, and the section above for what `AUTH_PROVIDERS` and the other
environment variables do.

## Test layout

```
packages/db/src/*.test.ts          Migration apply/idempotency against a real Postgres
                                    (packages/db/src/migrate.test.ts skips cleanly, not
                                    a failure, when DATABASE_URL is unreachable)

packages/auth/src/*.test.ts        config.test.ts           — AUTH_PROVIDERS parsing/validation
                                    provider-enablement.test.ts — the flip-test: builds a real
                                                                  Better Auth instance per
                                                                  AUTH_PROVIDERS subset and
                                                                  asserts accepted/rejected
                                                                  methods match
                                    oauth-integration.test.ts — OAuth callback + cross-provider
                                                                account-linking behavior
                                    email-flows.test.ts       — password-reset round-trip and
                                                                email-verification gating against
                                                                the real handler + a recording
                                                                mailer
                                    schema-parity.test.ts     — Drizzle schema matches what
                                                                Better Auth expects

apps/web/**/*.test.ts(x)           Component tests (method-registry, social buttons, panels)
                                    plus three integration suites that run requests through the
                                    real Better Auth handler (in-memory adapter, no network):
                                      app/auth-flow.integration.test.tsx    — signup/login/logout,
                                                                              wrong-password (no
                                                                              account enumeration)
                                      app/passkey-flow.integration.test.tsx — WebAuthn register +
                                                                              login ceremony via a
                                                                              virtual authenticator
                                      app/api/auth-methods/route.test.ts    — GET /api/auth-methods
                                                                              matches AUTH_PROVIDERS

apps/mobile/src/**/*.test.ts       Unit tests for the biometric gate (no-hardware/not-enrolled
                                    never lock out), email/password and social sign-in ports,
                                    auth-methods parsing, deep-link scheme resolution
```

Run everything with `bun run test` (Vitest workspaces, one process, 21 files /
200 tests as of this writing — 3 of them skip cleanly without a reachable
`DATABASE_URL`). Run a single workspace with
`bun run --filter <name> test` or `cd` into it and run `vitest` directly.

### A note on origin validation in tests

Better Auth skips its origin/CSRF checks whenever `NODE_ENV=test` (which
Vitest sets), so a naive integration test proves nothing about that path —
it would pass identically against a request with a forged or missing
`Origin`. Every suite that drives a real Better Auth instance through
`auth.handler` now pins `advanced: { disableOriginCheck: false }` so it
cannot be quietly relying on the test-mode bypass:

- `apps/web/test/create-test-auth-fetch.ts` (backs `auth-flow.integration.test.tsx`
  and `passkey-flow.integration.test.tsx`) — its stub `fetch` always attaches a
  same-origin `Origin` header, so flipping the check on here genuinely proves
  the signup/login/logout and WebAuthn ceremonies satisfy real origin
  validation, not just the test-mode default.
- `packages/auth/src/oauth-integration.test.ts` (account creation,
  cross-provider linking, cancelled consent) — its `call()` helper sends no
  `Origin` header at all, and the suite still passes with the check on: the
  flows it exercises are guarded by the state-bound OAuth cookie and a
  `callbackURL` that is always the trusted relative `"/"`, not by the
  `Origin` header. The flag doesn't make this suite assert anything new; it
  removes the possibility that it silently would if that stopped being true.

`packages/auth/src/provider-enablement.test.ts`'s mobile deep-link callback
tests exercise `callbackURL` validation directly (a related but distinct
check — which redirect targets are trusted) against malformed/mismatched
schemes, independent of `disableOriginCheck`.

The three flows that are actually origin/CSRF-sensitive — the web
email/password + WebAuthn ceremonies, the OAuth account-creation/linking
callback, and the mobile deep-link callback — all now drive the real check.
`provider-enablement.test.ts`'s main `describe.each` suite (mount/reject per
`AUTH_PROVIDERS` subset) deliberately keeps the `NODE_ENV=test` default: it's
asserting which routes and providers are mounted, not origin trust, and its
`/sign-in/social` calls always pass the same trusted relative `callbackURL:
"/"` the deep-link suite already covers with the check on.

## CI

Every PR runs lint, typecheck, and the full Vitest suite against a real
Postgres service container (`.github/workflows/ci.yml`).
