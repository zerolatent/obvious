# examples/mobile

A minimal Expo (React Native) client for the modular auth system. One screen:
sign-in methods fetched from the auth server, email/password, Google/Apple via
the deep-link hop, and a biometric session-gate demo — using `@app/auth/expo`
like `apps/mobile` does, but a fraction of the surface (no expo-router, no
port/adapter test scaffolding).

## Run it

Start [`examples/api`](../api) (or `apps/web`) first — mobile is always
cross-origin, so it needs a real server to talk to:

```sh
cp .env.example .env   # EXPO_PUBLIC_AUTH_BASE_URL defaults to examples/api on :4000
bun run --filter @example/mobile dev
```

Then open in a simulator or Expo Go from the printed QR code.

## Social sign-in (Google/Apple)

Tapping a social button opens the system browser to the provider's consent
screen; on success the provider redirects to `obvious-auth-example://`, the
scheme registered in `app.json`, which `@better-auth/expo` catches and turns
into a stored session. This requires the auth server to have that provider
configured — see the root README's provider guide.

## Biometric gate demo

"Run biometric gate demo" (shown once signed in) calls
[`evaluateBiometricGate`](./src/biometric-gate.ts) directly. The rule it
demonstrates: a device with no sensor, or a sensor with nothing enrolled,
unlocks immediately with no prompt — there is nothing to lock a demo behind on
a simulator with no biometrics configured. Only a device that can actually
prompt is allowed to withhold, and a failed attempt is retryable rather than a
sign-out.

## Point it at a different server

Change `EXPO_PUBLIC_AUTH_BASE_URL` in `.env` to `apps/web`'s origin and
restart the Expo dev server (Expo inlines `EXPO_PUBLIC_*` at build time, so a
running instance won't pick up a change without a restart).
