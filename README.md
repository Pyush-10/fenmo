# Expense Tracker

Minimal full-stack personal expense tracker with an API and web UI.

## Run locally

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

Optional env vars:

- `PORT` (default `3000`)
- `EXPENSES_DB_FILE` (default `./data/expenses.db`)

## API

### `POST /expenses`

Create an expense.

Body:

```json
{
  "amount": 123.45,
  "category": "Food",
  "description": "Dinner",
  "date": "2026-05-01"
}
```

Optional idempotency key:

- Header: `Idempotency-Key: <unique-key>`
- Fallback: `request_id` in body

If the same key is retried, the API returns the original expense instead of creating a duplicate.

### `GET /expenses`

Returns expenses with optional query params:

- `category=<value>` exact category match (case-insensitive)
- `sort=date_desc` newest date first

Response includes:

- `expenses`: array of expenses
- `total_amount_minor`: total amount of returned expenses in paise

## Data model

- `id`
- `amount_minor` (integer paise)
- `category`
- `description`
- `date` (`YYYY-MM-DD`)
- `created_at` (ISO timestamp)

## Design decisions

- **Persistence**: SQLite database file (`data/expenses.db`) with table-based schema and transactional writes.
- **Money correctness**: amounts stored in minor units (`amount_minor`, paise) to avoid floating-point rounding issues.
- **Retry safety**: idempotent `POST /expenses` using `Idempotency-Key` mapping so duplicate submits/retries are safe.
- **Resilience UX**: frontend keeps a pending request id in `localStorage` so retries use the same key and do not duplicate rows.

## Trade-offs (timebox)

- SQLite keeps setup simple and durable for single-instance deployments, but this is not a horizontally scaled multi-instance architecture.
- Auth, pagination, and richer reporting were intentionally left out to keep the assignment focused.

## Intentionally not done

- No user accounts or multi-tenant data isolation.
- No advanced category analytics UI (beyond list total).
- No multi-region or distributed database setup.

## Deploy (Render)

1. Push repository to GitHub.
2. In Render: create a **Web Service** from the repo.
3. Configure:
   - Build command: `npm install`
   - Start command: `npm start`
4. Add a **Persistent Disk** (for example mounted at `/var/data`).
5. Add environment variable:
   - `EXPENSES_DB_FILE=/var/data/expenses.db`
6. Deploy and verify:
   - `GET /health`
   - create/list/filter/sort flows from the UI

## Tests

Run:

```bash
npm test
```

Included tests:

- idempotent retry behavior for `POST /expenses`
- filtering + date sort behavior for `GET /expenses`
