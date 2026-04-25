const express = require("express");

function parseRecordedAt(dateStr) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid date: ${dateStr}`);
  }
  return d;
}

function collectRows(userId, body) {
  const rows = [];
  const { steps = [], heartRate = [], sleep = [] } = body;

  for (const item of steps) {
    rows.push({
      type: "steps",
      value: Number(item.value),
      recorded_at: parseRecordedAt(item.date),
    });
  }
  for (const item of heartRate) {
    rows.push({
      type: "heart_rate",
      value: Number(item.value),
      recorded_at: parseRecordedAt(item.date),
    });
  }
  for (const item of sleep) {
    rows.push({
      type: "sleep",
      value: Number(item.value),
      recorded_at: parseRecordedAt(item.date),
    });
  }

  for (const r of rows) {
    if (Number.isNaN(r.value)) {
      throw new Error("Each metric must have a numeric value");
    }
  }

  return rows.map((r) => ({
    user_id: userId,
    type: r.type,
    value: r.value,
    recorded_at: r.recorded_at,
  }));
}

function createApp({ pool }) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.post("/health-data", async (req, res) => {
    try {
      const userId = req.body && req.body.userId;
      if (!userId || typeof userId !== "string") {
        return res.status(400).json({ error: "userId (string) is required" });
      }

      let rows;
      try {
        rows = collectRows(userId, req.body);
      } catch (e) {
        return res.status(400).json({ error: e.message });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertText =
          "INSERT INTO health_data (user_id, type, value, recorded_at) VALUES ($1, $2, $3, $4)";
        for (const row of rows) {
          await client.query(insertText, [
            row.user_id,
            row.type,
            row.value,
            row.recorded_at,
          ]);
        }
        await client.query("COMMIT");
      } catch (err) {
        try {
          await client.query("ROLLBACK");
        } catch (_) {
          /* ignore */
        }
        throw err;
      } finally {
        client.release();
      }

      return res.json({ success: true });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: "Failed to store health data" });
    }
  });

  return app;
}

module.exports = {
  createApp,
  collectRows,
  parseRecordedAt,
};
