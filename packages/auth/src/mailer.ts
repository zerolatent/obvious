/**
 * The mail seam: the one place auth hands an outbound message to something
 * that can actually deliver it.
 *
 * No SMTP or provider SDK ships in this package on purpose. Delivery is a
 * deployment concern with a different answer at every deployment (SendGrid,
 * SES, Resend, Postmark, an internal queue), and baking one in would make
 * that choice a fork rather than a config line. What ships is the interface
 * plus a console implementation that keeps local development runnable
 * without any credentials at all.
 *
 * Plugging in a real provider is one adapter object — see the
 * "Password reset & email verification" section of the repo README.
 */

/** A single outbound message. Deliberately the intersection of what every provider accepts. */
export interface OutgoingMail {
  to: string
  subject: string
  /** Plain-text body. Always populated: some clients render nothing else. */
  text: string
  /** HTML body. Always populated too, so an adapter never has to synthesize one. */
  html: string
}

/**
 * The pluggable delivery contract. One method, no provider vocabulary: an
 * adapter is a closure over a provider SDK, not a subclass.
 *
 * A rejected promise propagates into the Better Auth request that triggered
 * it. That is intentional — a reset email that silently failed to send is
 * indistinguishable, to the user, from one that was never requested.
 */
export interface Mailer {
  sendMail(mail: OutgoingMail): Promise<void>
}

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
}

/**
 * Escape interpolation into the HTML bodies below. The action URLs carry a
 * token in a query string, so `&` alone would already produce invalid markup
 * that some clients silently repair into a broken link.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char)
}

/**
 * How long the action links stay valid, in human words. Both flows use Better
 * Auth's default token lifetime (1 hour); this package does not shorten it,
 * so the copy and the behavior cannot drift.
 */
const LINK_LIFETIME = "1 hour"

/** The password-reset message. Pure: same inputs, same bytes, trivially assertable. */
export function passwordResetMail(params: { to: string; url: string }): OutgoingMail {
  const { to, url } = params
  return {
    to,
    subject: "Reset your password",
    text: [
      "We received a request to reset your password.",
      "",
      `Open this link to choose a new one (valid for ${LINK_LIFETIME}):`,
      url,
      "",
      "If you didn't request this, you can ignore this email — your password stays unchanged.",
    ].join("\n"),
    html: [
      "<p>We received a request to reset your password.</p>",
      `<p><a href="${escapeHtml(url)}">Choose a new password</a> (valid for ${LINK_LIFETIME}).</p>`,
      "<p>If you didn't request this, you can ignore this email — your password stays unchanged.</p>",
    ].join("\n"),
  }
}

/** The email-verification message. */
export function emailVerificationMail(params: { to: string; url: string }): OutgoingMail {
  const { to, url } = params
  return {
    to,
    subject: "Verify your email address",
    text: [
      "Confirm this address to finish setting up your account.",
      "",
      `Open this link to verify it (valid for ${LINK_LIFETIME}):`,
      url,
      "",
      "If you didn't create an account, you can ignore this email.",
    ].join("\n"),
    html: [
      "<p>Confirm this address to finish setting up your account.</p>",
      `<p><a href="${escapeHtml(url)}">Verify your email</a> (valid for ${LINK_LIFETIME}).</p>`,
      "<p>If you didn't create an account, you can ignore this email.</p>",
    ].join("\n"),
  }
}

/** Banner on every console-mailer message. Grep-able, and hard to mistake for a real send. */
export const CONSOLE_MAILER_BANNER =
  "[auth:console-mailer] DEV ONLY — no email was sent. Configure a real mailer before production."

export interface ConsoleMailerOptions {
  /** Defaults to `console.info`. Injectable so tests read the output instead of the terminal. */
  log?: (message: string) => void
}

/**
 * The default mailer: prints the message, action link included, to the server
 * log. Development and CI only.
 *
 * It is the default rather than a hard failure because a fresh clone must be
 * able to walk the whole reset round-trip with no credentials — the link is
 * right there in the server output. The flip side is that in production it
 * would print reset tokens into the log stream while sending nothing, so the
 * banner says so on every single message and the README repeats it.
 */
export function createConsoleMailer(options: ConsoleMailerOptions = {}): Mailer {
  const log = options.log ?? ((message: string) => console.info(message))

  return {
    sendMail(mail: OutgoingMail): Promise<void> {
      log(
        [
          CONSOLE_MAILER_BANNER,
          `  to:      ${mail.to}`,
          `  subject: ${mail.subject}`,
          ...mail.text.split("\n").map((line) => `  | ${line}`),
        ].join("\n"),
      )
      return Promise.resolve()
    },
  }
}
