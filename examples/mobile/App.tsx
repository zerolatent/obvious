import { useEffect, useState, type ReactNode } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
} from "react-native"
import { StatusBar } from "expo-status-bar"

import { authClient } from "./src/auth-client"
import { evaluateBiometricGate, type GateDecision } from "./src/biometric-gate"
import { fetchAuthMethods } from "./src/methods"
import { APP_SCHEME } from "./src/config"

/**
 * The one screen: enabled methods, email/password, the social deep-link hop,
 * and the biometric gate demo — everything examples/mobile exists to show.
 */
export default function App() {
  return (
    <View style={styles.screen}>
      <StatusBar style="auto" />
      <Text style={styles.title}>Obvious Auth — examples/mobile</Text>
      <AuthArea />
    </View>
  )
}

function AuthArea() {
  const session = authClient.useSession()

  if (session.isPending) return <Loading label="Restoring your session…" />

  if (session.data) {
    return <SignedIn email={session.data.user.email} />
  }

  return <SignInMethods />
}

function SignedIn({ email }: { email: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.body}>Signed in as {email}</Text>
      <GateDemo />
      <AppButton label="Sign out" onPress={() => void authClient.signOut()} />
    </View>
  )
}

function SignInMethods() {
  const [state, setState] = useState<
    { status: "loading" } | { status: "error"; message: string } | { status: "ready"; methods: string[] }
  >({ status: "loading" })

  useEffect(() => {
    let cancelled = false
    fetchAuthMethods()
      .then((methods) => {
        if (!cancelled) setState({ status: "ready", methods })
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            status: "error",
            message: error instanceof Error ? error.message : String(error),
          })
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (state.status === "loading") return <Loading label="Checking available sign-in methods…" />
  if (state.status === "error") return <Notice>{state.message}</Notice>

  if (state.methods.length === 0) {
    return <Notice>No sign-in methods are enabled for this deployment.</Notice>
  }

  return (
    <View style={styles.section}>
      {state.methods.includes("email-password") && <EmailPasswordForm />}
      {state.methods.includes("google") && <SocialButton provider="google" label="Continue with Google" />}
      {state.methods.includes("apple") && <SocialButton provider="apple" label="Continue with Apple" />}
      {state.methods.includes("passkey") && (
        <Text style={styles.body}>
          Passkeys aren&apos;t offered on mobile in this example — see examples/web.
        </Text>
      )}
    </View>
  )
}

function EmailPasswordForm() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)

  async function handleSignIn() {
    setError(null)
    const { error: authError } = await authClient.signIn.email({ email, password })
    if (authError) setError(authError.message ?? "Sign-in failed.")
  }

  async function handleSignUp() {
    setError(null)
    const { error: authError } = await authClient.signUp.email({ email, password, name: email })
    if (authError) setError(authError.message ?? "Sign-up failed.")
  }

  return (
    <View style={styles.field}>
      <TextInput
        style={styles.input}
        placeholder="Email"
        autoComplete="email"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        autoComplete="password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />
      <AppButton label="Sign in" onPress={() => void handleSignIn()} />
      <AppButton label="Sign up" onPress={() => void handleSignUp()} variant="secondary" />
      {error && <Notice>{error}</Notice>}
    </View>
  )
}

/**
 * Google and Apple on mobile hop through the system browser and return via
 * `<scheme>://` — the deep link @better-auth/expo registers for this app's
 * `APP_SCHEME`. The redirect itself is handled entirely by
 * `authClient.signIn.social`; there is nothing further to await here on
 * success because the browser hop already delivered the session.
 */
function SocialButton({ provider, label }: { provider: "google" | "apple"; label: string }) {
  const [error, setError] = useState<string | null>(null)

  async function handleClick() {
    setError(null)
    const { error: authError } = await authClient.signIn.social({
      provider,
      callbackURL: `${APP_SCHEME}://`,
    })
    if (authError) setError(authError.message ?? `${label} failed.`)
  }

  return (
    <View>
      <AppButton label={label} onPress={() => void handleClick()} variant="secondary" />
      {error && <Notice>{error}</Notice>}
    </View>
  )
}

/**
 * The never-lockout demo: run the gate, show which of the four outcomes the
 * device produced. No-hardware and not-enrolled devices unlock immediately —
 * try it in a simulator with no biometrics enrolled to see that path.
 */
function GateDemo() {
  const [decision, setDecision] = useState<GateDecision | null>(null)
  const [checking, setChecking] = useState(false)

  async function runGate() {
    setChecking(true)
    setDecision(await evaluateBiometricGate("Unlock the demo session"))
    setChecking(false)
  }

  return (
    <View style={styles.field}>
      <AppButton label="Run biometric gate demo" onPress={() => void runGate()} disabled={checking} />
      {checking && <Loading label="Checking device biometrics…" />}
      {decision?.status === "unlocked" && <Notice>Unlocked — reason: {decision.reason}</Notice>}
      {decision?.status === "locked" && <Notice>Locked — {decision.error} (retry any time)</Notice>}
    </View>
  )
}

function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator />
      <Text style={styles.body}>{label}</Text>
    </View>
  )
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <View style={styles.notice}>
      <Text style={styles.noticeText}>{children}</Text>
    </View>
  )
}

function AppButton({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string
  onPress: PressableProps["onPress"]
  disabled?: boolean
  variant?: "primary" | "secondary"
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[styles.button, variant === "secondary" && styles.buttonSecondary]}
    >
      <Text style={variant === "secondary" ? styles.buttonSecondaryText : styles.buttonText}>{label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, paddingTop: 64, gap: 20 },
  section: { gap: 12 },
  field: { gap: 8 },
  centered: { alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontWeight: "600" },
  body: { fontSize: 15, color: "#374151" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: { backgroundColor: "#111827", borderRadius: 8, paddingVertical: 12, alignItems: "center" },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#d1d5db" },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonSecondaryText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  notice: { backgroundColor: "#f3f4f6", borderRadius: 8, padding: 10 },
  noticeText: { color: "#374151", fontSize: 14 },
})
