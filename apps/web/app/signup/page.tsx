"use client"

import { AuthMethodsPanel } from "../../components/auth/auth-methods-panel"

export default function SignupPage() {
  return (
    <main>
      <h1>Sign up</h1>
      <AuthMethodsPanel mode="signup" />
    </main>
  )
}
