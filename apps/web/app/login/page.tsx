"use client"

import { AuthMethodsPanel } from "../../components/auth/auth-methods-panel"

export default function LoginPage() {
  return (
    <main>
      <h1>Log in</h1>
      <AuthMethodsPanel mode="login" />
    </main>
  )
}
