/**
 * Auth error page.
 *
 * Reached when `/api/auth/login` or `/api/auth/callback` cannot
 * complete sign-in. Renders a generic, caregiver-friendly message
 * (NEVER raw Cognito output) plus a button back to `/auth/sign-in`.
 *
 * Codes are mapped through `authErrorMessage`, which falls through to
 * a generic message for any unmapped value — so a tampered `?code=` in
 * the URL cannot coerce a misleading prompt onto the page.
 */

import Link from "next/link"
import { authErrorMessage, isKnownAuthErrorCode } from "@/lib/auth/errors"

export const dynamic = "force-dynamic"

interface AuthErrorPageProps {
  searchParams: { code?: string }
}

export default function AuthErrorPage({ searchParams }: AuthErrorPageProps) {
  const message = authErrorMessage(
    isKnownAuthErrorCode(searchParams.code) ? searchParams.code : null,
  )

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-gray-900 border border-border rounded-xl shadow-sm px-8 py-10">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">
            Sign-in didn&apos;t complete
          </h1>
          <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
            {message}
          </p>
          <Link
            href="/auth/sign-in"
            className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-[#1D9E75] hover:bg-[#187E5D] text-white text-sm font-medium h-11 px-5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B5BDB] focus-visible:ring-offset-2"
          >
            Back to sign-in
          </Link>
          <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
            If the problem keeps happening, please contact your NARTHECare
            administrator. Do not share account details or care recipient
            information by email.
          </p>
        </div>
      </div>
    </main>
  )
}
