import { useState } from "react"

import { emailPasswordActions } from "../src/auth/actions"
import { authClient } from "../src/auth/client"
import { signOut } from "../src/auth/emailPassword"
import { SignInScreen } from "../src/auth/SignInScreen"
import { useAuthMethods } from "../src/auth/useAuthMethods"
import { useSessionGate } from "../src/auth/useSessionGate"
import { Body, Button, Loading, Notice, Screen, Title } from "../src/ui/primitives"

/**
 * The app's single screen, and the order of the three questions it asks:
 * is there a session, may we reveal it, and — if not — what may we offer?
 */
export default function MobileHomeScreen() {
  const session = authClient.useSession()
  const hasStoredSession = session.data != null
  const gate = useSessionGate(hasStoredSession)

  if (session.isPending) return <Loading label="Restoring your session…" />

  if (session.error) {
    return (
      <Screen>
        <Title>Obvious Auth</Title>
        <Notice tone="error">
          Could not reach the auth server: {session.error.message ?? "unknown error"}
        </Notice>
        <Button label="Try again" onPress={() => void session.refetch()} />
      </Screen>
    )
  }

  if (hasStoredSession) {
    if (gate.state.status === "checking") return <Loading label="Unlocking…" />

    if (gate.state.status === "locked") {
      return (
        <Screen>
          <Title>Locked</Title>
          <Body>
            Your session is still here — unlock with Face ID or your fingerprint to continue.
          </Body>
          <Notice tone="error">{gate.state.error}</Notice>
          <Button label="Try again" onPress={gate.retry} />
        </Screen>
      )
    }

    return <SignedInScreen email={session.data?.user.email ?? "your account"} />
  }

  return <SignInMethods />
}

function SignInMethods() {
  const { state, reload } = useAuthMethods()

  if (state.status === "loading") return <Loading label="Checking available sign-in methods…" />

  if (state.status === "error") {
    return (
      <Screen>
        <Title>Obvious Auth</Title>
        <Notice tone="error">Could not load sign-in methods: {state.message}</Notice>
        <Button label="Try again" onPress={reload} />
      </Screen>
    )
  }

  return (
    <>
      <SignInScreen methods={state.methods} />
      {state.unsupported.length > 0 && (
        <Notice tone="info">
          This server also offers {state.unsupported.join(", ")}, which this version of the app
          cannot present. Update the app to use {state.unsupported.length > 1 ? "them" : "it"}.
        </Notice>
      )}
    </>
  )
}

function SignedInScreen({ email }: { email: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runSignOut = () => {
    setBusy(true)
    setError(null)
    void signOut(emailPasswordActions)
      .then((result) => {
        if (result.status === "error") setError(result.message)
      })
      .finally(() => setBusy(false))
  }

  return (
    <Screen>
      <Title>Signed in</Title>
      <Body>{email}</Body>
      {error !== null && <Notice tone="error">{error}</Notice>}
      <Button label="Sign out" onPress={runSignOut} disabled={busy} />
    </Screen>
  )
}
