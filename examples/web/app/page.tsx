"use client"

import type { AuthMethodsResponse, ProviderId } from "@app/auth"
import { useEffect, useState, type FormEvent } from "react"

import { authClient } from "../lib/auth-client"

type MethodsState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; methods: ProviderId[] }

/** Pure fetch, kept separate from the effect so it's testable without React. */
async function fetchAuthMethods(): Promise<ProviderId[]> {
  const response = await fetch("/api/auth-methods")
  if (!response.ok) {
    throw new Error(`GET /api/auth-methods failed with status ${response.status}`)
  }
  const data = (await response.json()) as AuthMethodsResponse
  return data.methods
}

function useAuthMethods(): MethodsState {
  const [state, setState] = useState<MethodsState>({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    fetchAuthMethods()
      .then((methods) => {
        if (!cancelled) setState({ status: "ready", methods })
      })
      .catch(() => {
        if (!cancelled) setState({ status: "error" })
      })
    return () => {
      cancelled = true
    }
  }, [])

  return state
}

export default function HomePage() {
  const methods = useAuthMethods()
  const session = authClient.useSession()

  return (
    <main>
      <h1>Obvious Auth — examples/web</h1>
      <p>Fetches its enabled sign-in methods from the auth server; renders only those.</p>

      {session.isPending ? (
        <p>Loading session…</p>
      ) : session.data ? (
        <SignedIn email={session.data.user.email} />
      ) : methods.status === "loading" ? (
        <p>Loading sign-in options…</p>
      ) : methods.status === "error" ? (
        <p role="alert">Could not reach the auth server. Is it running?</p>
      ) : (
        <SignInMethods methods={methods.methods} />
      )}
    </main>
  )
}

function SignedIn({ email }: { email: string }) {
  return (
    <section>
      <p>Signed in as {email}</p>
      <button type="button" onClick={() => authClient.signOut()}>
        Sign out
      </button>
    </section>
  )
}

function SignInMethods({ methods }: { methods: ProviderId[] }) {
  if (methods.length === 0) {
    return <p>No sign-in methods are enabled for this deployment.</p>
  }

  return (
    <section>
      {methods.includes("email-password") && <EmailPasswordForm />}
      {methods.includes("google") && <SocialButton provider="google" label="Continue with Google" />}
      {methods.includes("apple") && <SocialButton provider="apple" label="Continue with Apple" />}
      {methods.includes("passkey") && <PasskeyButton />}
    </section>
  )
}

function EmailPasswordForm() {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const { error: authError } =
      mode === "sign-up"
        ? await authClient.signUp.email({ email, password, name: email })
        : await authClient.signIn.email({ email, password })
    if (authError) setError(authError.message ?? "Something went wrong.")
  }

  return (
    <form aria-label={mode === "sign-up" ? "Sign up" : "Sign in"} onSubmit={handleSubmit}>
      <label>
        Email
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
      </label>
      <label>
        Password
        <input
          type="password"
          required
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
      </label>
      <button type="submit">{mode === "sign-up" ? "Sign up" : "Sign in"}</button>
      <button type="button" onClick={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}>
        {mode === "sign-up" ? "Have an account? Sign in" : "New here? Sign up"}
      </button>
      {error && <p role="alert">{error}</p>}
    </form>
  )
}

function SocialButton({ provider, label }: { provider: "google" | "apple"; label: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    const { error: authError } = await authClient.signIn.social({
      provider,
      callbackURL: "/",
      errorCallbackURL: "/",
    })
    // No `else`: on success Better Auth navigates the browser away.
    if (authError) setError(authError.message ?? `${label} failed.`)
  }

  return (
    <div>
      <button type="button" onClick={handleClick}>
        {label}
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

function PasskeyButton() {
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    const { error: authError } = await authClient.signIn.passkey()
    if (authError) setError(authError.message ?? "Passkey sign-in failed.")
  }

  return (
    <div>
      <button type="button" onClick={handleClick}>
        Sign in with a passkey
      </button>
      {error && <p role="alert">{error}</p>}
    </div>
  )
}
