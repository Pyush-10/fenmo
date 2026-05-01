const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const request = require("supertest");

function createAppForTest() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "expense-tracker-"));
  const dataFile = path.join(tempDir, "expenses.json");
  process.env.EXPENSES_DATA_FILE = dataFile;

  delete require.cache[require.resolve("../src/store")];
  delete require.cache[require.resolve("../src/server")];
  const { app } = require("../src/server");

  return { app, tempDir };
}

test("POST /expenses handles idempotent retries", async () => {
  const { app } = createAppForTest();

  const payload = {
    amount: 123.45,
    category: "Food",
    description: "Dinner",
    date: "2026-05-01",
  };

  const first = await request(app)
    .post("/expenses")
    .set("Idempotency-Key", "abc-123")
    .send(payload);
  assert.equal(first.status, 201);
  assert.equal(first.body.idempotent_replay, false);

  const retry = await request(app)
    .post("/expenses")
    .set("Idempotency-Key", "abc-123")
    .send(payload);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.idempotent_replay, true);
  assert.equal(retry.body.expense.id, first.body.expense.id);

  const list = await request(app).get("/expenses");
  assert.equal(list.status, 200);
  assert.equal(list.body.expenses.length, 1);
  assert.equal(list.body.total_amount_minor, 12345);
});

test("GET /expenses supports category filter and date_desc sorting", async () => {
  const { app } = createAppForTest();
  const entries = [
    {
      amount: 100,
      category: "Food",
      description: "Breakfast",
      date: "2026-05-01",
    },
    {
      amount: 400,
      category: "Transport",
      description: "Cab",
      date: "2026-05-03",
    },
    {
      amount: 200,
      category: "Food",
      description: "Lunch",
      date: "2026-05-02",
    },
  ];

  for (let i = 0; i < entries.length; i += 1) {
    // unique key avoids accidental collisions
    await request(app)
      .post("/expenses")
      .set("Idempotency-Key", `seed-${i}`)
      .send(entries[i]);
  }

  const filtered = await request(app).get(
    "/expenses?category=food&sort=date_desc",
  );

  assert.equal(filtered.status, 200);
  assert.equal(filtered.body.expenses.length, 2);
  assert.deepEqual(
    filtered.body.expenses.map((e) => e.date),
    ["2026-05-02", "2026-05-01"],
  );
  assert.equal(filtered.body.total_amount_minor, 30000);
});
