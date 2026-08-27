import { memoryAdapter } from "better-auth/adapters/memory"
import { describe, expect, it } from "vitest"

import {
  CONSOLE_MAILER_BANNER,
  createConsoleMailer,
  emailVerificationMail,
  passwordResetMail,
  type Mailer,
  type OutgoingMail,
} from "./mailer"
import { createAuth, type AuthEnv } from "./server"

/**
 * The two mail-driven flows, end to end against the real Better Auth handler
 * with an in-memory database and a recording mailer.
 *
 * Nothing here stubs a Better Auth internal: every token in these tests is one
 * the server actually minted and handed to the mailer, and every assertion
 * about "the user can now log in" is a real sign-in request. A test that
 * asserted on the callback arguments alone would pass just as happily against
 * a reset link the reset endpoint refuses to honor.
 */

const EMAIL = "reader@example.com"
const PASSWORD = "correct-horse-battery"
const NEW_PASSWORD = "a-different-passphrase"

const CREDENTIALS: AuthEnv = {
  BETTER_AUTH_URL: "http://localhost:3000",
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  AUTH_PROVIDERS: "email-password",
}

interface RecordingMailer {
  mailer: Mailer
  sent: OutgoingMail[]
}

/** A mailer that keeps what it was handed, so tests read real message bodies. */
function recordingMailer(): RecordingMailer {
  const sent: OutgoingMail[] = []
  return {
    sent,
    mailer: {
      sendMail(mail) {
        sent.push(mail)
        return Promise.resolve()
      },
    },
  }
}

interface Harness {
  auth: ReturnType<typeof createAuth>["auth"]
  sent: OutgoingMail[]
}

function buildAuth(
  overrides: { providers?: string; requireEmailVerification?: string } = {},
): Harness {
  const { mailer, sent } = recordingMailer()
  const { auth } = createAuth({
    env: {
      ...CREDENTIALS,
      ...(overrides.providers !== undefined && { AUTH_PROVIDERS: overrides.providers }),
      ...(overrides.requireEmailVerification !== undefined && {
        AUTH_REQUIRE_EMAIL_VERIFICATION: overrides.requireEmailVerification,
      }),
    },
    database: memoryAdapter({ user: [], session: [], account: [], verification: [], passkey: [] }),
    mailer,
  })
  return { auth, sent }
}

interface AuthResponse {
  status: number
  location: string | null
  body: { code?: string; status?: boolean; token?: string | null; message?: string }
}

async function call(
  auth: Harness["auth"],
  path: string,
  body?: Record<string, unknown>,
): Promise<AuthResponse> {
  const response = await auth.handler(
    new Request(`http://localhost:3000/api/auth${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }),
  )
  const text = await response.text()
  return {
    status: response.status,
    location: response.headers.get("location"),
    body: text.length > 0 ? (JSON.parse(text) as AuthResponse["body"]) : {},
  }
}

function signUp(auth: Harness["auth"]) {
  return call(auth, "/sign-up/email", { email: EMAIL, password: PASSWORD, name: "Reader" })
}

function signIn(auth: Harness["auth"], password: string) {
  return call(auth, "/sign-in/email", { email: EMAIL, password })
}

/**
 * Pull the action URL out of a message the way a user pulls it out of their
 * inbox — from the body text, not from a callback argument the test captured.
 */
function actionUrl(mail: OutgoingMail): string {
  const [, url] = /(http\S+)/.exec(mail.text) ?? []
  if (!url) throw new Error(`No action link in mail body:\n${mail.text}`)
  return url
}

/** The reset link is `.../reset-password/<token>?callbackURL=`. */
function resetToken(mail: OutgoingMail): string {
  const link = actionUrl(mail)
  const [, token] = /\/reset-password\/([^?\s]+)/.exec(link) ?? []
  if (!token) throw new Error(`No reset token in link: ${link}`)
  return token
}

/** Strip the origin so the link can be replayed through `call()`. */
function authPath(url: string): string {
  return url.replace("http://localhost:3000/api/auth", "")
}

/**
 * The one message a flow should have produced. Asserting the count here (rather
 * than indexing and hoping) means "sent two verification emails" fails loudly
 * instead of passing on the first one.
 */
function onlyMail(sent: OutgoingMail[]): OutgoingMail {
  expect(sent).toHaveLength(1)
  const [mail] = sent
  if (!mail) throw new Error("unreachable: length asserted on the line above")
  return mail
}

describe("password reset", () => {
  it("mails a working reset link when an account exists", async () => {
    const { auth, sent } = buildAuth()
    await signUp(auth)

    const requested = await call(auth, "/request-password-reset", { email: EMAIL })

    expect(requested.status).toBe(200)
    const mail = onlyMail(sent)
    expect(mail.to).toBe(EMAIL)
    expect(mail.subject).toBe("Reset your password")
    // Both bodies carry the link: a text-only client and an HTML client both work.
    expect(mail.text).toContain("/reset-password/")
    expect(mail.html).toContain("/reset-password/")
    expect(resetToken(mail).length).toBeGreaterThan(0)
  })

  it("completes the round-trip: the new password works and the old one stops working", async () => {
    const { auth, sent } = buildAuth()
    await signUp(auth)
    await call(auth, "/request-password-reset", { email: EMAIL })

    const reset = await call(auth, "/reset-password", {
      token: resetToken(onlyMail(sent)),
      newPassword: NEW_PASSWORD,
    })
    expect(reset.status).toBe(200)

    expect((await signIn(auth, NEW_PASSWORD)).status).toBe(200)

    const withOldPassword = await signIn(auth, PASSWORD)
    expect(withOldPassword.status).toBe(401)
    expect(withOldPassword.body.code).toBe("INVALID_EMAIL_OR_PASSWORD")
  })

  it("burns the token: the same reset link cannot be replayed", async () => {
    const { auth, sent } = buildAuth()
    await signUp(auth)
    await call(auth, "/request-password-reset", { email: EMAIL })
    const token = resetToken(onlyMail(sent))

    expect((await call(auth, "/reset-password", { token, newPassword: NEW_PASSWORD })).status).toBe(
      200,
    )

    const replay = await call(auth, "/reset-password", {
      token,
      newPassword: "yet-another-passphrase",
    })
    expect(replay.status).toBe(400)
    expect(replay.body.code).toBe("INVALID_TOKEN")
    // And the replay changed nothing.
    expect((await signIn(auth, NEW_PASSWORD)).status).toBe(200)
  })

  it("answers an unknown address identically and mails nobody", async () => {
    const { auth, sent } = buildAuth()
    await signUp(auth)

    const known = await call(auth, "/request-password-reset", { email: EMAIL })
    const unknown = await call(auth, "/request-password-reset", { email: "nobody@example.com" })

    expect(unknown.status).toBe(known.status)
    expect(unknown.body).toEqual(known.body)
    // One mail total — the known address only.
    expect(sent.map((mail) => mail.to)).toEqual([EMAIL])
  })

  it("is not offered at all when email-password is disabled", async () => {
    const { auth, sent } = buildAuth({ providers: "passkey" })

    const requested = await call(auth, "/request-password-reset", { email: EMAIL })

    // Better Auth mounts this route unconditionally and gates it on the
    // presence of `sendResetPassword`, so withholding the callback is what
    // keeps a disabled login method from being resettable.
    expect(requested.status).toBe(400)
    expect(requested.body.code).toBe("RESET_PASSWORD_DISABLED")
    expect(sent).toHaveLength(0)
  })
})

describe("email verification, toggle off (the default)", () => {
  it("sends nothing on signup and lets an unverified user log in", async () => {
    const { auth, sent } = buildAuth()

    expect((await signUp(auth)).status).toBe(200)
    expect(sent).toHaveLength(0)
    expect((await signIn(auth, PASSWORD)).status).toBe(200)
  })

  it("is the behavior when the env var is unset, blank, or explicitly false", async () => {
    for (const value of [undefined, "", "false", "0", "off", "no"]) {
      const { auth, sent } = buildAuth({ requireEmailVerification: value })
      await signUp(auth)
      expect(sent).toHaveLength(0)
      expect((await signIn(auth, PASSWORD)).status).toBe(200)
    }
  })
})

describe("email verification, toggle on", () => {
  const ON = { requireEmailVerification: "true" }

  it("mails a verification link on signup", async () => {
    const { auth, sent } = buildAuth(ON)

    await signUp(auth)

    const mail = onlyMail(sent)
    expect(mail.to).toBe(EMAIL)
    expect(mail.subject).toBe("Verify your email address")
    expect(actionUrl(mail)).toContain("/verify-email?token=")
  })

  it("blocks login until the address is proven", async () => {
    const { auth } = buildAuth(ON)
    await signUp(auth)

    const blocked = await signIn(auth, PASSWORD)

    expect(blocked.status).toBe(403)
    expect(blocked.body.code).toBe("EMAIL_NOT_VERIFIED")
    expect(blocked.body.token).toBeUndefined()
  })

  it("still answers a wrong password with the generic error, so the block leaks no account", async () => {
    const { auth } = buildAuth(ON)
    await signUp(auth)

    const wrongPassword = await signIn(auth, "definitely-the-wrong-password")
    const unknownAccount = await call(auth, "/sign-in/email", {
      email: "nobody@example.com",
      password: PASSWORD,
    })

    // The verification block is only reachable *after* the password checks
    // out, so a caller without credentials cannot tell an unverified account
    // apart from one that does not exist.
    expect(wrongPassword.status).toBe(401)
    expect(wrongPassword.body.code).toBe("INVALID_EMAIL_OR_PASSWORD")
    expect(unknownAccount.status).toBe(wrongPassword.status)
    expect(unknownAccount.body.code).toBe(wrongPassword.body.code)
  })

  it("lets the emailed link finish verification, after which login succeeds", async () => {
    const { auth, sent } = buildAuth(ON)
    await signUp(auth)

    // Follow the exact link from the message body.
    const verified = await call(auth, authPath(actionUrl(onlyMail(sent))))
    // The signup link carries a callbackURL, so success is a redirect back
    // into the app rather than a JSON body.
    expect(verified.status).toBe(302)
    expect(verified.location).toBe("/")

    expect((await signIn(auth, PASSWORD)).status).toBe(200)
  })

  it("rejects a garbage verification token", async () => {
    const { auth } = buildAuth(ON)
    await signUp(auth)

    const verified = await call(auth, "/verify-email?token=not-a-real-token")

    expect(verified.status).toBe(401)
    expect(verified.body.code).toBe("INVALID_TOKEN")
    expect((await signIn(auth, PASSWORD)).status).toBe(403)
  })

  it("rejects an unparseable toggle value at boot rather than defaulting off", () => {
    expect(() => buildAuth({ requireEmailVerification: "yeah-sure" })).toThrow(
      /AUTH_REQUIRE_EMAIL_VERIFICATION/,
    )
  })
})

describe("message bodies", () => {
  it("escapes the action URL into the HTML body", () => {
    const url = "http://localhost:3000/api/auth/verify-email?token=abc&callbackURL=%2F"

    const mail = emailVerificationMail({ to: EMAIL, url })

    expect(mail.html).toContain("token=abc&amp;callbackURL=%2F")
    expect(mail.html).not.toContain("token=abc&callbackURL")
    // The plain-text body is not markup, so it keeps the URL verbatim.
    expect(mail.text).toContain(url)
  })

  it("tells the recipient what to do if they did not ask for it", () => {
    expect(passwordResetMail({ to: EMAIL, url: "http://x/y" }).text).toContain("ignore this email")
    expect(emailVerificationMail({ to: EMAIL, url: "http://x/y" }).text).toContain(
      "ignore this email",
    )
  })
})

describe("console mailer", () => {
  it("prints the action link and marks itself as not for production", async () => {
    const lines: string[] = []
    const mailer = createConsoleMailer({ log: (message) => lines.push(message) })

    await mailer.sendMail(passwordResetMail({ to: EMAIL, url: "http://localhost:3000/reset/xyz" }))

    const output = lines.join("\n")
    expect(output).toContain(CONSOLE_MAILER_BANNER)
    expect(CONSOLE_MAILER_BANNER).toContain("DEV ONLY")
    expect(output).toContain(EMAIL)
    // The whole point of the dev mailer: the link is readable in the log.
    expect(output).toContain("http://localhost:3000/reset/xyz")
  })

  it("is what createAuth falls back to when no mailer is injected", async () => {
    const { auth } = createAuth({
      env: CREDENTIALS,
      database: memoryAdapter({
        user: [],
        session: [],
        account: [],
        verification: [],
        passkey: [],
      }),
    })
    await signUp(auth)

    // No mailer option, no throw: a fresh clone can walk the reset flow with
    // zero mail credentials configured.
    const requested = await call(auth, "/request-password-reset", { email: EMAIL })
    expect(requested.status).toBe(200)
  })
})
