const express = require("express");
const path = require("node:path");
const { createExpense, listExpenses } = require("./store");

const app = express();
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/expenses", (req, res) => {
  const idempotencyKey =
    req.get("Idempotency-Key") ||
    (typeof req.body?.request_id === "string" ? req.body.request_id : null);

  const result = createExpense(req.body || {}, idempotencyKey);
  if (result.error) {
    return res.status(400).json({ error: result.error });
  }

  return res.status(result.replay ? 200 : 201).json({
    expense: result.expense,
    idempotent_replay: result.replay,
  });
});

app.get("/expenses", (req, res) => {
  const category = req.query.category;
  const sort = req.query.sort;

  const { items, totalMinor } = listExpenses({ category, sort });
  return res.json({
    expenses: items,
    total_amount_minor: totalMinor,
  });
});

app.use(express.static(path.join(__dirname, "..", "public")));
app.use((_req, res) => {
  res.sendFile(path.join(__dirname, "..", "public", "index.html"));
});

const PORT = process.env.PORT || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Expense tracker running on http://localhost:${PORT}`);
  });
}

module.exports = { app };
