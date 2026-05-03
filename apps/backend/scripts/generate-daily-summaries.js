/**
 * Phase 4B job — generate one daily AI summary per recipient.
 *
 * Should run AFTER both `recompute-baselines.js` and
 * `evaluate-alerts.js` so the summary's structured input reflects the
 * freshest baselines.
 *
 * Generator selection: defaults to the deterministic template
 * generator (`lib/ai-summary-template.js`). A future
 * Anthropic-backed generator can be wired up here once the
 * no-PHI-in-logs transport, timeout / retry policy, and
 * `ANTHROPIC_API_KEY` provisioning land.
 *
 * Exit codes:
 *   0 — sweep completed cleanly
 *   1 — fatal boot / DB failure (no recipient was processed)
 *   2 — sweep completed but at least one recipient errored — see logs
 */
import { aiSummaryService } from "../services/index.js"
import { runJob } from "./_job-runtime.js"

await runJob("generate-daily-summaries", (pool) =>
  aiSummaryService.generateDailySummariesForAllRecipients(pool, {
    now: new Date(),
  }),
)
