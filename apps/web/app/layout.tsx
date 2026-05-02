import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"

export const metadata: Metadata = {
  title: "NARTHECare — Caregiver Care Hub",
  description:
    "NARTHECare helps caregivers monitor, coordinate, and support their Care " +
    "Members with AI-assisted summaries, alerts, and action plans. " +
    "Informational only — never diagnostic.",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans bg-gray-50 dark:bg-gray-950 antialiased">
        <div className="flex min-h-screen">
          <Sidebar />
         <main className="flex-1 lg:pl-60 min-w-0 overflow-x-hidden">
            <div className="px-3 py-4 pt-16 lg:pt-4 max-w-full">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}

