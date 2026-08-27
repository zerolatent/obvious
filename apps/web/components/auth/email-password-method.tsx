"use client"

import { useState, type FormEvent } from "react"

import { authClient } from "../../lib/auth-client"
import type { AuthMethodProps } from "./method-registry"

/**
 * Shown for every sign-in failure — wrong password, unknown email, unverified
 * email — without distinction. Better Auth already collapses "wrong
 * password" and "no such account" into one server error; this is the
 * client-side half of that invariant: we never surface the server's error
 * text here, because a future error code could be more specific than the
 * server's current one and quietly start leaking account existence.
 */
const GENERIC_LOGIN_ERROR = "Incorrect email or password."

type SubmitStatus = "idle" | "submitting" | "error"

/** The email/password provider's UI, switched by the shared login/signup mode. */
export function EmailPasswordMethod({ mode }: AuthMethodProps) {
  return mode === "signup" ? <EmailPasswordSignupForm /> : <EmailPasswordLoginForm />
}

function EmailPasswordSignupForm() {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [complete, setComplete] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")
    setErrorMessage(null)

    const { error } = await authClient.signUp.email({ name, email, password })
    if (error) {
      setStatus("error")
      setErrorMessage(error.message ?? "Could not create your account.")
      return
    }

    setStatus("idle")
    setComplete(true)
  }

  if (complete) {
    return <p role="status">Account created. You can now log in.</p>
  }

  return (
    <form aria-label="Sign up with email and password" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="signup-name">Name</label>
        <input
          id="signup-name"
          type="text"
          autoComplete="name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="signup-email">Email</label>
        <input
          id="signup-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="signup-password">Password</label>
        <input
          id="signup-password"
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Creating account\u2026" : "Sign up"}
      </button>
      {status === "error" && errorMessage && <p role="alert">{errorMessage}</p>}
    </form>
  )
}

function EmailPasswordLoginForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [status, setStatus] = useState<SubmitStatus>("idle")
  const [loggedIn, setLoggedIn] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus("submitting")

    const { error } = await authClient.signIn.email({ email, password })
    if (error) {
      // Deliberately ignore `error.message` / `error.code` — see
      // GENERIC_LOGIN_ERROR above.
      setStatus("error")
      return
    }

    setStatus("idle")
    setLoggedIn(true)
  }

  if (loggedIn) {
    return <p role="status">Logged in.</p>
  }

  return (
    <form aria-label="Log in with email and password" onSubmit={handleSubmit}>
      <div>
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </div>
      <div>
        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </div>
      <button type="submit" disabled={status === "submitting"}>
        {status === "submitting" ? "Logging in\u2026" : "Log in"}
      </button>
      {status === "error" && <p role="alert">{GENERIC_LOGIN_ERROR}</p>}
    </form>
  )
}
