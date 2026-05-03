/**
 * Phase 4B nightly job — recompute every (`recipient × metric × window`)
 * baseline.
 *
 * Run via Aptible Cron (`aptible app:run -- node scripts/recompute-baselines.js`)
 * or a host-side scheduler. The job is idempotent (`upsertBaseline`
 * keys on the partial UNIQUE) so safe to retry on transient failure.
 *
 * Exit codes:
 *   0 — sweep completed cleanly
 *   1 — fatal boot / DB failure (no recipient was processed)
 *   2 — sweep completed but at least one recipient errored — see logs
 */
import { metricBaselineService } from "../services/index.js"
import { runJob } from "./_job-runtime.js"

await runJob("recompute-baselines", (pool) =>
  metricBaselineService.recomputeBaselinesForAllRecipients(pool, {
    now: new Date(),
  }),
)
