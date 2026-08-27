import type { ReactNode } from "react"

export const metadata = {
  title: "Obvious Auth",
  description: "Pluggable signup and login, configured per deployment.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
