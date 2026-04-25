const { Pool } = require("pg");
//const { createApp } = require("./app");

const PORT = Number(process.env.PORT) || 3000;

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required (PostgreSQL connection string)."
    );
  }
  const ssl =
    process.env.PGSSLMODE === "disable"
      ? false
      : { rejectUnauthorized: false };
  return new Pool({ connectionString, ssl });
}

const pool = createPool();

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS health_data (
      id SERIAL PRIMARY KEY,
      user_id TEXT NOT NULL,
      type TEXT NOT NULL,
      value DOUBLE PRECISION NOT NULL,
      recorded_at TIMESTAMPTZ NOT NULL
    );
  `);
}

//const app = createApp({ pool });

async function main() {
  await ensureSchema();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Listening on ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
