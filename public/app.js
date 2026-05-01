const expenseForm = document.getElementById("expenseForm");
const submitButton = document.getElementById("submitButton");
const formStatus = document.getElementById("formStatus");
const listStatus = document.getElementById("listStatus");
const categoryFilter = document.getElementById("categoryFilter");
const refreshButton = document.getElementById("refreshButton");
const expensesBody = document.getElementById("expensesBody");
const totalLabel = document.getElementById("totalLabel");

const REQUEST_ID_KEY = "expenseTracker.pendingRequestId";
let currentFilter = "";

function formatMinorAmount(minor) {
  return `₹${(minor / 100).toFixed(2)}`;
}

function buildQuery() {
  const query = new URLSearchParams();
  if (currentFilter) {
    query.set("category", currentFilter);
  }
  query.set("sort", "date_desc");
  return query.toString();
}

function renderRows(expenses) {
  expensesBody.innerHTML = "";

  if (!expenses.length) {
    const row = document.createElement("tr");
    row.innerHTML = `<td colspan="4">No expenses found.</td>`;
    expensesBody.appendChild(row);
    return;
  }

  for (const expense of expenses) {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${expense.date}</td>
      <td>${expense.category}</td>
      <td>${expense.description}</td>
      <td class="right">${formatMinorAmount(expense.amount_minor)}</td>
    `;
    expensesBody.appendChild(row);
  }
}

async function loadExpenses() {
  listStatus.textContent = "Loading expenses...";
  try {
    const query = buildQuery();
    const res = await fetch(`/expenses${query ? `?${query}` : ""}`);
    if (!res.ok) {
      throw new Error(`Unable to load expenses (${res.status})`);
    }
    const data = await res.json();
    renderRows(data.expenses);
    totalLabel.innerHTML = `<strong>Total: ${formatMinorAmount(data.total_amount_minor)}</strong>`;
    listStatus.textContent = "";
  } catch (error) {
    listStatus.textContent = error.message;
  }
}

function getOrCreatePendingRequestId() {
  const existing = localStorage.getItem(REQUEST_ID_KEY);
  if (existing) {
    return existing;
  }
  const generated = crypto.randomUUID();
  localStorage.setItem(REQUEST_ID_KEY, generated);
  return generated;
}

async function submitExpense(event) {
  event.preventDefault();
  formStatus.textContent = "";

  const formData = new FormData(expenseForm);
  const payload = {
    amount: formData.get("amount"),
    category: formData.get("category"),
    description: formData.get("description"),
    date: formData.get("date"),
  };

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  const requestId = getOrCreatePendingRequestId();
  try {
    const res = await fetch("/expenses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestId,
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Failed to save expense");
    }

    formStatus.textContent = data.idempotent_replay
      ? "Previous save confirmed (duplicate request ignored)."
      : "Expense saved.";

    localStorage.removeItem(REQUEST_ID_KEY);
    expenseForm.reset();
    await loadExpenses();
  } catch (error) {
    formStatus.textContent = `${error.message}. You can retry safely.`;
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "Save Expense";
  }
}

expenseForm.addEventListener("submit", submitExpense);
refreshButton.addEventListener("click", () => {
  loadExpenses();
});

categoryFilter.addEventListener("input", () => {
  currentFilter = categoryFilter.value.trim();
  loadExpenses();
});

loadExpenses();
