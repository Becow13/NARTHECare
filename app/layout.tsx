import type { Metadata } from "next"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"

export const metadata: Metadata = {
  title: "NartheCare — AI-Powered Remote Eldercare",
  description:
    "Monitor, coordinate, and support your Care Member loved ones with AI-assisted caregiving.",
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
          <main className="flex-1 lg:pl-60 min-w-0">
            <div className="px-4 sm:px-6 lg:px-8 py-6 pt-16 lg:pt-6">
              {children}
            </div>
          </main>
        </div>
      </body>
    </html>
  )
}

