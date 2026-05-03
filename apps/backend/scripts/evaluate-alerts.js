/**
 * Phase 4B job — evaluate the rule engine against every recipient's
 * recent observations + current baselines and persist any new alerts.
 *
 * Should run AFTER `recompute-baselines.js` so the engine compares
 * against the latest baseline rows. The DAO's partial UNIQUE on
 * `(source_type, source_record_id)` makes the run idempotent.
 *
 * Exit codes:
 *   0 — sweep completed cleanly
 *   1 — fatal boot / DB failure (no recipient was processed)
 *   2 — sweep completed but at least one recipient errored — see logs
 */
import { alertService } from "../services/index.js"
import { runJob } from "./_job-runtime.js"

await runJob("evaluate-alerts", (pool) =>
  alertService.evaluateAlertsForAllRecipients(pool, { now: new Date() }),
)
