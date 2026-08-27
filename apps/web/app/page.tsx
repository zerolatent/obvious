import { SessionStatus } from "../components/auth/session-status"

export default function HomePage() {
  return (
    <main>
      <h1>Obvious Auth</h1>
      <p>Pluggable signup and login, configured per deployment.</p>
      <SessionStatus />
    </main>
  )
}
