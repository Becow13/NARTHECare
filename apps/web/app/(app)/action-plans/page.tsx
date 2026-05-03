/**
 * `/action-plans` — caregiver-wide entry point that redirects into
 * the per-recipient action-plan feed.
 *
 * Phase 1 backend exposes action plans only on a per-recipient
 * endpoint (`GET /care-recipients/:id/action-plans`). Rather than fan
 * out an N+1 fetch here, this page asks the caregiver to pick a Care
 * Member and links into `/seniors/[id]?tab=action-plans`, which loads
 * the real backend feed.
 *
 * The previous prototype rendered `MOCK_ACTION_PLANS` here — that
 * mock fallback is intentionally gone.
 */
import { RecipientSelectorEmpty } from "@/components/recipient-selector-empty"

export default function ActionPlansPage() {
  return <RecipientSelectorEmpty feature="action-plans" />
}
