import type { ReactNode } from "react"
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native"

/** The app's small shared vocabulary of screen elements. */

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>
}

export function Title({ children }: { children: ReactNode }) {
  return <Text style={styles.title}>{children}</Text>
}

export function Body({ children }: { children: ReactNode }) {
  return <Text style={styles.body}>{children}</Text>
}

export function Loading({ label }: { label: string }) {
  return (
    <View style={styles.centered} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator />
      <Text style={styles.body}>{label}</Text>
    </View>
  )
}

export type NoticeTone = "error" | "info"

export function Notice({ tone, children }: { tone: NoticeTone; children: ReactNode }) {
  return (
    <View style={[styles.notice, tone === "error" ? styles.noticeError : styles.noticeInfo]}>
      <Text style={tone === "error" ? styles.noticeErrorText : styles.body}>{children}</Text>
    </View>
  )
}

export function Field({ label, ...inputProps }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        accessibilityLabel={label}
        placeholderTextColor="#9ca3af"
        {...inputProps}
      />
    </View>
  )
}

export function Button({
  label,
  onPress,
  disabled,
  variant = "primary",
}: {
  label: string
  onPress: () => void
  disabled?: boolean
  variant?: "primary" | "secondary"
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        variant === "secondary" && styles.buttonSecondary,
        disabled === true && styles.buttonDisabled,
      ]}
    >
      <Text style={variant === "secondary" ? styles.buttonSecondaryText : styles.buttonText}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24, gap: 16, justifyContent: "center" },
  centered: { alignItems: "center", gap: 12 },
  title: { fontSize: 24, fontWeight: "600" },
  body: { fontSize: 15, color: "#374151" },
  label: { fontSize: 13, fontWeight: "500", color: "#374151" },
  field: { gap: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  buttonSecondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: "#d1d5db" },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: "#ffffff", fontSize: 16, fontWeight: "600" },
  buttonSecondaryText: { color: "#111827", fontSize: 16, fontWeight: "600" },
  notice: { borderRadius: 8, padding: 12 },
  noticeError: { backgroundColor: "#fef2f2" },
  noticeInfo: { backgroundColor: "#f3f4f6" },
  noticeErrorText: { color: "#b91c1c", fontSize: 15 },
})
