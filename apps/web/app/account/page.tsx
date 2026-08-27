"use client"

import { PasskeyRegistration } from "../../components/auth/passkey-registration"
import { authClient } from "../../lib/auth-client"

export default function AccountPage() {
  const { data: session, isPending } = authClient.useSession()

  if (isPending) return null

  if (!session) {
    return (
      <main>
        <h1>Account</h1>
        <p>
          <a href="/login">Log in</a> to manage your account.
        </p>
      </main>
    )
  }

  return (
    <main>
      <h1>Account</h1>
      <p>Signed in as {session.user.email}</p>
      <PasskeyRegistration />
    </main>
  )
}
