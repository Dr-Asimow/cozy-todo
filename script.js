// --- Supabase yapılandırması ---
const SUPABASE_URL = "https://mlhlgefowuuskxooxird.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1saGxnZWZvd3V1c2t4b294aXJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA1OTA1NzcsImV4cCI6MjA5NjE2NjU3N30.JZM2Al1egj9n2z7xqyo0psI-ow0vfkIS7GZLSowhYi0";
const AUTH_URL = `${SUPABASE_URL}/auth/v1`;
const REST = `${SUPABASE_URL}/rest/v1/todos`;
const SESSION_KEY = "cozy-session";

// --- Oturum yönetimi ---
let session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");

function saveSession(s) {
  session = s;
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

function clearSession() {
  session = null;
  localStorage.removeItem(SESSION_KEY);
}

// Erişim token'ı süresi dolduysa refresh token ile yenile
async function refreshSession() {
  if (!session?.refresh_token) throw new Error("Oturum yok");
  const res = await fetch(`${AUTH_URL}/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: session.refresh_token }),
  });
  if (!res.ok) {
    clearSession();
    throw new Error("Oturum süresi doldu");
  }
  saveSession(await res.json());
}

// --- Auth REST çağrıları (GoTrue) ---
async function authRequest(path, body) {
  const res = await fetch(`${AUTH_URL}${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error_description || data.msg || data.message || "İşlem başarısız");
  }
  return data;
}

async function signUp(email, password) {
  // mailer_autoconfirm açık olduğu için kayıt anında oturum (access_token) döner
  const data = await authRequest("/signup", { email, password });
  if (!data.access_token) {
    // Beklenmedik durumda otomatik giriş dene
    return signIn(email, password);
  }
  saveSession(data);
  return data;
}

async function signIn(email, password) {
  const data = await authRequest("/token?grant_type=password", { email, password });
  saveSession(data);
  return data;
}

// --- Veri (PostgREST) çağrıları; kullanıcı token'ı ile RLS uygulanır ---
function dataHeaders(extra = {}) {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

async function api(path = "", options = {}, retried = false) {
  const res = await fetch(REST + path, { ...options, headers: dataHeaders(options.headers) });
  if (res.status === 401 && !retried) {
    await refreshSession(); // token yenile ve bir kez daha dene
    return api(path, options, true);
  }
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

const fetchTodos = () => api("?select=*&order=created_at.desc", { method: "GET" });
const createTodo = (text) =>
  api("", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ text }) });
const updateTodo = (id, patch) =>
  api(`?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify(patch) });
const deleteTodo = (id) => api(`?id=eq.${id}`, { method: "DELETE" });
const deleteDone = () => api(`?done=eq.true`, { method: "DELETE" });

// =================== UI ===================
const authView = document.getElementById("auth-view");
const appView = document.getElementById("app-view");
const authForm = document.getElementById("auth-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const authError = document.getElementById("auth-error");
const authSubmit = document.getElementById("auth-submit");
const authSubtitle = document.getElementById("auth-subtitle");
const authSwitchText = document.getElementById("auth-switch-text");
const authToggle = document.getElementById("auth-toggle");
const userEmail = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");

const form = document.getElementById("todo-form");
const input = document.getElementById("todo-input");
const list = document.getElementById("todo-list");
const counter = document.getElementById("counter");
const clearBtn = document.getElementById("clear-done");
const filterBtns = document.querySelectorAll(".filter-btn");

let todos = [];
let filter = "all";
let mode = "login"; // "login" | "signup"

// ---- Auth ekranı ----
function setMode(next) {
  mode = next;
  authError.hidden = true;
  if (mode === "signup") {
    authSubtitle.textContent = "Yeni bir hesap oluştur 🌱";
    authSubmit.textContent = "Kayıt ol";
    authSwitchText.textContent = "Zaten hesabın var mı?";
    authToggle.textContent = "Giriş yap";
    passwordInput.autocomplete = "new-password";
  } else {
    authSubtitle.textContent = "Hesabına giriş yap ☕";
    authSubmit.textContent = "Giriş yap";
    authSwitchText.textContent = "Hesabın yok mu?";
    authToggle.textContent = "Kayıt ol";
    passwordInput.autocomplete = "current-password";
  }
}

function showError(msg) {
  authError.textContent = msg;
  authError.hidden = false;
}

authToggle.addEventListener("click", () => setMode(mode === "login" ? "signup" : "login"));

authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  authError.hidden = true;
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  authSubmit.disabled = true;
  authSubmit.textContent = "Lütfen bekle…";
  try {
    if (mode === "signup") await signUp(email, password);
    else await signIn(email, password);
    enterApp();
  } catch (err) {
    showError(err.message);
  } finally {
    authSubmit.disabled = false;
    setMode(mode);
  }
});

logoutBtn.addEventListener("click", () => {
  clearSession();
  todos = [];
  showAuth();
});

// ---- Görünüm geçişleri ----
function showAuth() {
  appView.hidden = true;
  authView.hidden = false;
  authForm.reset();
  setMode("login");
}

async function enterApp() {
  authView.hidden = true;
  appView.hidden = false;
  userEmail.textContent = session.user?.email || "";
  await load();
}

// ---- Todo UI ----
function showEmpty(message) {
  const li = document.createElement("li");
  li.className = "empty";
  li.textContent = message;
  list.appendChild(li);
}

// İçerik değişirken listeyi eski yükseklikten yeni yüksekliğe yumuşakça taşır.
// Üst kenar sabit kalır, liste yalnızca aşağıya doğru açılır/kapanır.
function animateHeight(mutate) {
  const start = list.offsetHeight;
  mutate();
  const end = list.offsetHeight;
  if (start === end) return;
  list.style.overflow = "hidden";
  const anim = list.animate(
    [{ height: `${start}px` }, { height: `${end}px` }],
    { duration: 320, easing: "cubic-bezier(.22,.61,.36,1)" }
  );
  anim.onfinish = anim.oncancel = () => {
    list.style.overflow = "";
  };
}

function render() {
  animateHeight(() => {
    list.innerHTML = "";
    const visible = todos.filter((t) => {
      if (filter === "active") return !t.done;
      if (filter === "done") return t.done;
      return true;
    });

    if (visible.length === 0) {
      showEmpty(filter === "done" ? "Henüz biten görev yok 🌱" : "Liste tertemiz, harikasın! ✨");
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
    console.error(err);
    if (!session) return showAuth();
    list.innerHTML = "";
    showEmpty("Bağlantı hatası 😢");
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

// ---- Başlangıç ----
if (session?.access_token) {
  enterApp();
} else {
  showAuth();
}
