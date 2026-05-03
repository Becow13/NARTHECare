/**
 * DAO for one-shot SQL migrations under `apps/backend/migrations/`.
 *
 * Each `.sql` file in that directory is a stand-alone, idempotent
 * migration — re-running on a database that has already applied it
 * is a no-op (e.g. `DROP TABLE IF EXISTS …`, `ALTER TABLE … IF NOT
 * EXISTS …`). This matches the convention every per-feature
 * `ensureSchema` follows in this repo, so we deliberately do NOT
 * track applied migrations in a `schema_migrations` table.
 *
 * The runner exists to give one-shot DDL (e.g. dropping a legacy
 * table) a versioned home outside any feature DAO, so the
 * "remove a table" lifecycle event is greppable in one place
 * instead of being smuggled into an unrelated `ensureSchema`.
 *
 * The pool is injected so this module stays test-friendly with the
 * existing in-memory fake `pg.Pool`.
 */
import { readdir, readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const MIGRATIONS_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "migrations",
)

/**
 * Run every `.sql` file in `apps/backend/migrations/` in lexical
 * order against the injected pool.
 *
 * Each migration is wrapped in its own transaction so a partial
 * statement in one file cannot leave the next migration's BEGIN /
 * COMMIT in a half-applied state. The helper short-circuits with
 * a no-op when the directory is missing (fresh checkouts that have
 * not added any migrations yet) so boot order does not regress.
 */
export async function runPendingMigrations(pool) {
  const files = await _listMigrationFiles()
  for (const file of files) {
    const sql = await readFile(join(MIGRATIONS_DIR, file), "utf8")
    if (sql.trim().length === 0) continue
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("COMMIT")
    } catch (err) {
      try {
        await client.query("ROLLBACK")
      } catch {
        /* ignore — surface the original error */
      }
      throw err
    } finally {
      client.release()
    }
  }
}

async function _listMigrationFiles() {
  let entries
  try {
    entries = await readdir(MIGRATIONS_DIR)
  } catch (err) {
    if (err && err.code === "ENOENT") return []
    throw err
  }
  return entries.filter((name) => name.endsWith(".sql")).sort()
}
