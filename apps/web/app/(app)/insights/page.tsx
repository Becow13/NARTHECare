/**
 * `/insights` — caregiver-wide entry point that redirects into the
 * per-recipient AI Insights feed.
 *
 * Phase 1 backend exposes summaries only on a per-recipient endpoint
 * (`GET /care-recipients/:id/summaries`). Rather than fan out an N+1
 * fetch here, this page asks the caregiver to pick a Care Member and
 * links into `/seniors/[id]?tab=summaries`, which loads the real
 * backend feed.
 *
 * The previous prototype rendered `MOCK_SUMMARIES` here — that mock
 * fallback is intentionally gone.
 */
import { RecipientSelectorEmpty } from "@/components/recipient-selector-empty"

export default function InsightsPage() {
  return <RecipientSelectorEmpty feature="insights" />
}
