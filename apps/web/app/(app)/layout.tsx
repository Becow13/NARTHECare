import { redirect } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { getSessionUser } from "@/lib/auth/session"

/**
 * Authenticated app shell.
 *
 * Wraps every caregiver-facing route in `app/(app)/**` with the
 * sidebar + main content area. This layout enforces auth a SECOND time
 * (after `middleware.ts`): the middleware short-circuits unauthenticated
 * navigation, but a Server Component render that bypasses middleware
 * (e.g. an internal redirect) would otherwise leak the dashboard shell
 * before any data fetch.
 *
 * Why fetch the user here (and not in `Sidebar`):
 *   - `Sidebar` is a Client Component (it owns the mobile toggle).
 *     Reading the session from a Client Component would defeat the
 *     httpOnly design.
 *   - Centralising the read here lets every authenticated page share a
 *     single session round-trip per request via React's per-request
 *     cache (`getSession` is `cookies()`-backed, which is automatically
 *     deduped within a render pass).
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getSessionUser()
  if (!user) {
    redirect("/auth/sign-in")
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar user={user} />
      <main className="flex-1 lg:pl-60 min-w-0 overflow-x-hidden">
        <div className="px-3 py-4 pt-16 lg:pt-4 max-w-full">{children}</div>
      </main>
    </div>
  )
}
