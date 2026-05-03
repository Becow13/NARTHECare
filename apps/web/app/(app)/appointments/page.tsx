/**
 * `/appointments` — caregiver-wide entry point that redirects into
 * the per-recipient appointments feed.
 *
 * Phase 1 backend exposes appointments only on a per-recipient endpoint
 * (`GET /care-recipients/:id/appointments`). Rather than fan out an
 * N+1 fetch here, this page asks the caregiver to pick a Care Member
 * and links into `/seniors/[id]?tab=appointments`, which loads the
 * real backend feed.
 *
 * The previous prototype rendered `MOCK_APPOINTMENTS` here — that
 * mock fallback is intentionally gone.
 */
import { RecipientSelectorEmpty } from "@/components/recipient-selector-empty"

export default function AppointmentsPage() {
  return <RecipientSelectorEmpty feature="appointments" />
}
