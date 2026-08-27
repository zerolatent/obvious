import type { ProviderId } from "@app/auth"
import { useState } from "react"

import { Body, Button, Field, Notice, Screen, Title } from "../ui/primitives"
import { emailPasswordActions, socialSignInPorts } from "./actions"
import { signInWithEmail, signUpWithEmail } from "./emailPassword"
import { isSocialProvider, signInWithSocialProvider, type SocialProviderId } from "./socialSignIn"

type Mode = "sign-in" | "sign-up"

const SOCIAL_LABELS: Record<SocialProviderId, string> = {
  google: "Continue with Google",
  apple: "Continue with Apple",
}

/**
 * The sign-in surface, rendered from the server's enabled set — a method the
 * deployment did not enable has no control here at all, which is the same
 * contract the web client honours.
 *
 * `passkey` is deliberately not rendered: on mobile the platform biometric is
 * the gate over the stored session (see ./biometricGate), not a server-side
 * credential. It is reported in the notice below rather than shown as a broken
 * button.
 */
export function SignInScreen({ methods }: { methods: ProviderId[] }) {
  const [mode, setMode] = useState<Mode>("sign-in")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const socialProviders = methods.filter(isSocialProvider)
  const hasEmailPassword = methods.includes("email-password")
  const nothingToRender = !hasEmailPassword && socialProviders.length === 0

  const runEmailFlow = () => {
    setBusy(true)
    setError(null)
    setInfo(null)
    const flow =
      mode === "sign-up"
        ? signUpWithEmail(emailPasswordActions, { email, password, name: name.trim() || email })
        : signInWithEmail(emailPasswordActions, { email, password })

    void flow
      .then((result) => {
        if (result.status === "error") setError(result.message)
        // On success the session lands in secure storage and useSession()
        // re-renders the app into the signed-in screen; nothing to do here.
      })
      .finally(() => setBusy(false))
  }

  const runSocialFlow = (provider: SocialProviderId) => {
    setBusy(true)
    setError(null)
    setInfo(null)

    void signInWithSocialProvider(provider, socialSignInPorts)
      .then((outcome) => {
        if (outcome.status === "error") setError(outcome.message)
        // Cancelled: the user backed out of consent. The screen is unchanged
        // and every other method is still available — no error is shown.
        if (outcome.status === "cancelled") setInfo("Sign-in cancelled.")
      })
      .finally(() => setBusy(false))
  }

  return (
    <Screen>
      <Title>Obvious Auth</Title>
      <Body>{mode === "sign-up" ? "Create your account." : "Sign in to continue."}</Body>

      {error !== null && <Notice tone="error">{error}</Notice>}
      {info !== null && <Notice tone="info">{info}</Notice>}

      {nothingToRender && (
        <Notice tone="info">
          This deployment enables no sign-in method this app can present. Passkeys are a web method;
          on mobile, biometrics unlock an existing session.
        </Notice>
      )}

      {hasEmailPassword && (
        <>
          {mode === "sign-up" && (
            <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          )}
          <Field
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          <Button
            label={mode === "sign-up" ? "Create account" : "Sign in"}
            onPress={runEmailFlow}
            disabled={busy}
          />
          <Button
            variant="secondary"
            label={mode === "sign-up" ? "I already have an account" : "Create an account"}
            onPress={() => {
              setMode(mode === "sign-up" ? "sign-in" : "sign-up")
              setError(null)
              setInfo(null)
            }}
            disabled={busy}
          />
        </>
      )}

      {socialProviders.map((provider) => (
        <Button
          key={provider}
          variant="secondary"
          label={SOCIAL_LABELS[provider]}
          onPress={() => runSocialFlow(provider)}
          disabled={busy}
        />
      ))}
    </Screen>
  )
}
