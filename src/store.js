const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const DATA_FILE =
  process.env.EXPENSES_DATA_FILE ||
  path.join(__dirname, "..", "data", "expenses.json");
const DATA_DIR = path.dirname(DATA_FILE);

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DATA_FILE)) {
    const initial = { expenses: [], idempotency: {} };
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2), "utf-8");
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf-8");
  return JSON.parse(raw);
}

function writeData(data) {
  const tempPath = `${DATA_FILE}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tempPath, DATA_FILE);
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

function createExpense(payload, idempotencyKey) {
  const checked = validateExpense(payload);
  if (checked.error) {
    return { error: checked.error };
  }

  const data = readData();
  if (idempotencyKey && data.idempotency[idempotencyKey]) {
    const expenseId = data.idempotency[idempotencyKey];
    const existing = data.expenses.find((e) => e.id === expenseId);
    if (existing) {
      return { expense: existing, replay: true };
    }
  }

  const expense = {
    id: crypto.randomUUID(),
    ...checked.value,
    created_at: new Date().toISOString(),
  };
  data.expenses.push(expense);

  if (idempotencyKey) {
    data.idempotency[idempotencyKey] = expense.id;
  }

  writeData(data);
  return { expense, replay: false };
}

function listExpenses({ category, sort }) {
  const data = readData();
  let items = data.expenses.slice();

  if (category) {
    const normalized = String(category).trim().toLowerCase();
    items = items.filter((e) => e.category.toLowerCase() === normalized);
  }

  if (sort === "date_desc") {
    items.sort((a, b) => {
      if (a.date === b.date) {
        return b.created_at.localeCompare(a.created_at);
      }
      return b.date.localeCompare(a.date);
    });
  }

  const totalMinor = items.reduce((acc, item) => acc + item.amount_minor, 0);
  return { items, totalMinor };
}

module.exports = {
  createExpense,
  listExpenses,
  validateExpense,
};
