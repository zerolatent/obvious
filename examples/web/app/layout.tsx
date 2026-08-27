import type { ReactNode } from "react"

export const metadata = {
  title: "Obvious Auth — examples/web",
  description: "Minimal Next.js client exercising the modular auth system.",
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
