/**
 * Sign-in landing page.
 *
 * Public (no session required). Lives outside `/dashboard` so the
 * middleware allow-list (`/auth/**`) can show it without a session.
 *
 * Visual: NARTHECare wordmark + slogan + a single primary button that
 * GETs `/api/auth/login`. We avoid an HTML <form> because the route is
 * a redirect-only handler and a form POST adds CSRF surface for no
 * benefit. The button is a plain anchor so the page works without JS.
 *
 * Error display: `/auth/error` redirects here with `?error=<code>` on
 * non-fatal failures (cancelled Hosted UI etc.). Codes pass through
 * `authErrorMessage` so we never render a raw Cognito string.
 */

import Link from "next/link"
import { redirect } from "next/navigation"
import { authErrorMessage, isKnownAuthErrorCode } from "@/lib/auth/errors"
import { getSessionUser } from "@/lib/auth/session"

export const dynamic = "force-dynamic"

interface SignInPageProps {
  searchParams: { error?: string }
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  // Already signed in? Skip the page entirely.
  const user = await getSessionUser()
  if (user) redirect("/dashboard")

  const rawError = searchParams.error
  const errorMessage = isKnownAuthErrorCode(rawError)
    ? authErrorMessage(rawError)
    : null

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 border border-border rounded-xl shadow-sm px-8 py-10">
          <div className="flex items-center gap-3 mb-8">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-[#3B5BDB] shrink-0">
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10" cy="10" r="7" stroke="white" strokeWidth="1.5" strokeDasharray="9 5" strokeLinecap="round" transform="rotate(-30 10 10)" />
                <rect x="6.5" y="6.5" width="7" height="7" rx="1.5" fill="white" opacity="0.9" transform="rotate(45 10 10)" />
                <circle cx="10" cy="10" r="2" fill="#3B5BDB" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-semibold tracking-tight text-gray-900 dark:text-white">
                NARTHECare
              </span>
              <span className="text-[10px] font-medium tracking-widest text-gray-400 dark:text-[#91A7FF] uppercase">
                Caregiver Care Hub
              </span>
            </div>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Sign in to continue
          </h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            We&apos;ll redirect you to your secure NARTHECare account to verify it&apos;s you.
          </p>

          {errorMessage ? (
            <div
              role="alert"
              className="mt-6 rounded-md border border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300"
            >
              {errorMessage}
            </div>
          ) : null}

          <Link
            href="/api/auth/login"
            className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-[#1D9E75] hover:bg-[#187E5D] text-white text-sm font-medium h-11 px-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB] focus-visible:ring-offset-2"
          >
            Continue to secure sign-in
          </Link>

          <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
            NARTHECare is for caregiver coordination only. It is not a medical
            device and does not provide diagnosis or treatment instructions.
          </p>
        </div>
      </div>
    </main>
  )
}
