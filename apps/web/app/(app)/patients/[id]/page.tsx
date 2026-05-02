import { redirect } from "next/navigation"

/**
 * Legacy redirect from the pre-prototype `/patients/:id` route to the
 * unified `/seniors/:id` Care Member detail page. The earlier stub at
 * `/patients/:id/profile` was replaced by the prototype's
 * `/seniors/[id]` route during the web-first MVP pivot. Kept as a
 * permanent redirect so any external link or bookmark still resolves
 * without exposing PHI in URL paths (id stays a UUID).
 */
export default function LegacyPatientRedirect({
  params,
}: {
  params: { id: string }
}) {
  redirect(`/seniors/${params.id}`)
}
