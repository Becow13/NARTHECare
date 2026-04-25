-- Reference schema (also applied automatically on startup via server.js)

CREATE TABLE IF NOT EXISTS health_data (
  id SERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL
);
