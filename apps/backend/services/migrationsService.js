/**
 * Service-layer entry point for the boot-time SQL migrations runner.
 *
 * Mirrors the per-feature `ensureSchema` shape so `server.js` boots
 * every schema concern through one import surface. Each migration
 * file in `apps/backend/migrations/` is intrinsically idempotent;
 * see `services/dao/migrationsDao.js` for the runner contract.
 */
import { runPendingMigrations } from "./dao/migrationsDao.js"

/**
 * Apply every `.sql` file in `apps/backend/migrations/` once per boot.
 *
 * Must run AFTER the per-feature `ensureSchema` calls so a migration
 * can reference tables those calls just created (e.g. dropping a
 * legacy table that lived alongside `users` / `care_recipients`).
 * Re-running on a database that already applied each migration is a
 * no-op by convention — every migration uses
 * `DROP / ALTER / CREATE … IF [NOT] EXISTS` rather than relying on a
 * `schema_migrations` bookkeeping table.
 */
export async function applyMigrations(pool) {
  await runPendingMigrations(pool)
}
