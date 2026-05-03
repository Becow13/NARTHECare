/**
 * `/alerts` — caregiver-wide entry point that redirects into the
 * per-recipient alerts feed.
 *
 * Phase 1 backend exposes alerts only on a per-recipient endpoint
 * (`GET /care-recipients/:id/alerts`). Rather than fan out an N+1
 * fetch from this top-level page (which would also have to merge
 * PHI across recipients on the client), this page asks the caregiver
 * to pick a Care Member and links into `/seniors/[id]?tab=alerts`,
 * which loads the real backend feed.
 *
 * The previous prototype rendered `MOCK_ALERTS` here. That mock
 * fallback is intentionally gone — we never silently render fake
 * health data on a healthcare surface.
 */
import { RecipientSelectorEmpty } from "@/components/recipient-selector-empty"

export default function AlertsPage() {
  return <RecipientSelectorEmpty feature="alerts" />
}
