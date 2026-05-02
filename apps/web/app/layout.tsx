import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "NARTHECare — Caregiver Care Hub",
  description:
    "NARTHECare helps caregivers monitor, coordinate, and support their Care " +
    "Members with AI-assisted summaries, alerts, and action plans. " +
    "Informational only — never diagnostic.",
}

/**
 * Root layout — intentionally minimal.
 *
 * The sidebar shell lives in `app/(app)/layout.tsx` so the public auth
 * routes (`/auth/sign-in`, `/auth/error`) can render full-bleed without
 * the caregiver navigation. Both layouts compose through this one for
 * `<html>` / `<body>` / global styles.
 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans bg-gray-50 dark:bg-gray-950 antialiased">
        {children}
      </body>
    </html>
  )
}
