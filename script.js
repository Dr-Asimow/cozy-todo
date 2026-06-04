// --- Supabase bağlantısı (REST API / PostgREST) ---
const SUPABASE_URL = "https://mlhlgefowuuskxooxird.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saGxnZWZvd3V1c2t4b294aXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA1NzcsImV4cCI6MjA5NjE2NjU3N30.JZM2Al1egj9n2z7xqyo0psI-ow0vfkIS7GZLSowhYi0";
const REST = `${SUPABASE_URL}/rest/v1/todos`;

// Tüm tarayıcılar aynı listeyi paylaşsın diye sabit ortak kimlik.
// (Kişisel/tek kullanıcılı kullanım için. Çok kullanıcılı senkron istersen
//  Supabase Auth eklenip bu değer auth.uid() ile değiştirilebilir.)
const CLIENT_ID = "df136b97-ef02-49a6-90a1-be92c2abf868";

function headers(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function api(path = "", options = {}) {
  const res = await fetch(REST + path, options);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Supabase ${res.status}: ${body}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// --- CRUD işlemleri ---
async function fetchTodos() {
  return api(
    `?select=*&client_id=eq.${CLIENT_ID}&order=created_at.desc`,
    { headers: headers() }
  );
}

async function createTodo(text) {
  return api("", {
    method: "POST",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify({ client_id: CLIENT_ID, text }),
  });
}

async function updateTodo(id, patch) {
  return api(`?id=eq.${id}`, {
    method: "PATCH",
    headers: headers({ Prefer: "return=representation" }),
    body: JSON.stringify(patch),
  });
}

async function deleteTodo(id) {
  return api(`?id=eq.${id}`, { method: "DELETE", headers: headers() });
}

async function deleteDone() {
  return api(`?client_id=eq.${CLIENT_ID}&done=eq.true`, {
    method: "DELETE",
    headers: headers(),
  });
}

// --- UI ---
const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const counter = document.getElementById("counter");
const clearBtn = document.getElementById("clear-done");
const filterBtns = document.querySelectorAll(".filter-btn");

let todos = [];
let filter = "all";

function showEmpty(message) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = message;
  list.appendChild(li);
}

function render() {
  list.innerHTML = "";

  const visible = todos.filter((t) => {
    if (filter === "active") return !t.done;
    if (filter === "done") return t.done;
    return true;
  });

  if (visible.length === 0) {
    showEmpty(
      filter === "done"
        ? "Henüz biten görev yok 🌱"
        : "Liste tertemiz, harikasın! ✨"
    );
  }

  visible.forEach((todo) => {
    const li = document.createElement("li");
    li.className = "todo-item" + (todo.done ? " done" : "");

    const check = document.createElement("button");
    check.className = "check";
    check.innerHTML = todo.done ? "✓" : "";
    check.addEventListener("click", () => toggle(todo));

    const text = document.createElement("span");
    text.className = "text";
    text.textContent = todo.text;

    const del = document.createElement("button");
    del.className = "delete";
    del.innerHTML = "🗑";
    del.addEventListener("click", () => remove(todo.id));

    li.append(check, text, del);
    list.appendChild(li);
  });

  const remaining = todos.filter((t) => !t.done).length;
  counter.textContent = `${remaining} görev kaldı`;
}

async function load() {
  list.innerHTML = "";
  showEmpty("Yükleniyor… ⏳");
  try {
    todos = await fetchTodos();
    render();
  } catch (err) {
    list.innerHTML = "";
    showEmpty("Bağlantı hatası 😢");
    console.error(err);
  }
}

async function add(text) {
  const [created] = await createTodo(text);
  todos.unshift(created);
  render();
}

async function toggle(todo) {
  const [updated] = await updateTodo(todo.id, { done: !todo.done });
  todos = todos.map((t) => (t.id === updated.id ? updated : t));
  render();
}

async function remove(id) {
  await deleteTodo(id);
  todos = todos.filter((t) => t.id !== id);
  render();
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  input.value = "";
  input.focus();
  try {
    await add(value);
  } catch (err) {
    console.error(err);
  }
});

clearBtn.addEventListener("click", async () => {
  try {
    await deleteDone();
    todos = todos.filter((t) => !t.done);
    render();
  } catch (err) {
    console.error(err);
  }
});

filterBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    filterBtns.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    filter = btn.dataset.filter;
    render();
  });
});

load();
