const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DatabaseSync } = require("node:sqlite");

const DB_FILE =
  process.env.EXPENSES_DB_FILE || path.join(__dirname, "..", "data", "expenses.db");
const DATA_DIR = path.dirname(DB_FILE);

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function toMinorUnits(amount) {
  const num = Number(amount);
  if (!Number.isFinite(num)) {
    return null;
  }

  const scaled = Math.round(num * 100);
  if (Math.abs(num * 100 - scaled) > 1e-6) {
    return null;
  }

  return scaled;
}

function normalizeDate(input) {
  if (typeof input !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return null;
  }

  const date = new Date(`${input}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return input;
}

function validateExpense(input) {
  const amountMinor = toMinorUnits(input.amount);
  const category =
    typeof input.category === "string" ? input.category.trim() : "";
  const description =
    typeof input.description === "string" ? input.description.trim() : "";
  const date = normalizeDate(input.date);

  if (amountMinor === null || amountMinor <= 0) {
    return { error: "amount must be a positive number with up to 2 decimals" };
  }
  if (!category) {
    return { error: "category is required" };
  }
  if (!description) {
    return { error: "description is required" };
  }
  if (!date) {
    return { error: "date must be in YYYY-MM-DD format" };
  }

  return {
    value: {
      amount_minor: amountMinor,
      category,
      description,
      date,
    },
  };
}

ensureDataDir();
const db = new DatabaseSync(DB_FILE);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS expenses (
    id TEXT PRIMARY KEY,
    amount_minor INTEGER NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES expenses(id)
  );
`);

const findExpenseByIdStmt = db.prepare(
  "SELECT id, amount_minor, category, description, date, created_at FROM expenses WHERE id = ?",
);
const findIdempotencyStmt = db.prepare(
  "SELECT expense_id FROM idempotency_keys WHERE key = ?",
);
const insertExpenseStmt = db.prepare(
  "INSERT INTO expenses (id, amount_minor, category, description, date, created_at) VALUES (?, ?, ?, ?, ?, ?)",
);
const insertIdempotencyStmt = db.prepare(
  "INSERT INTO idempotency_keys (key, expense_id) VALUES (?, ?)",
);

function createExpense(payload, idempotencyKey) {
  const checked = validateExpense(payload);
  if (checked.error) {
    return { error: checked.error };
  }

  if (idempotencyKey) {
    const known = findIdempotencyStmt.get(idempotencyKey);
    if (known?.expense_id) {
      const existing = findExpenseByIdStmt.get(known.expense_id);
      if (existing) {
        return { expense: existing, replay: true };
      }
    }
  }

  const expense = {
    id: crypto.randomUUID(),
    ...checked.value,
    created_at: new Date().toISOString(),
  };

  try {
    db.exec("BEGIN IMMEDIATE");
    insertExpenseStmt.run(
      expense.id,
      expense.amount_minor,
      expense.category,
      expense.description,
      expense.date,
      expense.created_at,
    );
    if (idempotencyKey) {
      insertIdempotencyStmt.run(idempotencyKey, expense.id);
    }
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback errors when transaction did not start
    }
    if (idempotencyKey && /UNIQUE constraint failed: idempotency_keys.key/.test(String(error))) {
      const known = findIdempotencyStmt.get(idempotencyKey);
      if (known?.expense_id) {
        const existing = findExpenseByIdStmt.get(known.expense_id);
        if (existing) {
          return { expense: existing, replay: true };
        }
      }
    }
    throw error;
  }

  return { expense, replay: false };
}

function listExpenses({ category, sort }) {
  const filters = [];
  const params = [];

  if (category) {
    filters.push("LOWER(category) = LOWER(?)");
    params.push(String(category).trim());
  }

  const whereClause = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  const orderClause =
    sort === "date_desc" ? "ORDER BY date DESC, created_at DESC" : "ORDER BY created_at DESC";

  const rows = db
    .prepare(
      `SELECT id, amount_minor, category, description, date, created_at
       FROM expenses
       ${whereClause}
       ${orderClause}`,
    )
    .all(...params);

  const totalRow = db
    .prepare(`SELECT COALESCE(SUM(amount_minor), 0) AS total FROM expenses ${whereClause}`)
    .get(...params);
  const totalMinor = totalRow.total;

  const items = rows;
  return { items, totalMinor };
}

module.exports = {
  createExpense,
  listExpenses,
  validateExpense,
};
