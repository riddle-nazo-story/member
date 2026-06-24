// GASのWebアプリURLに変更してください
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const $ = (id) => document.getElementById(id);

let currentUser = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("logoutBtn").addEventListener("click", logout);

  const token = getToken();
  if (!token) {
    showAuthNotice();
    return;
  }

  try {
    const res = await api("me", { token });
    currentUser = res.user;
    showTicketSection();
    await loadEvents();
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    showAuthNotice();
  }
}

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, data }),
  });

  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "通信エラーが発生しました。");
  return json.result;
}

async function loadEvents() {
  const events = await api("listEvents");
  renderEvents(events);
}

function renderEvents(events) {
  const root = $("eventsList");

  if (!events.length) {
    root.innerHTML = `<p class="muted">現在公開中の公演はありません。</p>`;
    return;
  }

  root.innerHTML = events.map((event) => `
    <article class="card event-card no-image">
      <div class="event-info">
        <span class="badge ${event.type === "free" ? "free" : "paid"}">
          ${event.type === "free" ? "無料" : "有料"}
        </span>

        <h3>${escapeHtml(event.title)}</h3>

        <p class="muted">${escapeHtml(event.description || "")}</p>

        <a class="game-link" href="ticket-event.html?eventId=${encodeURIComponent(event.eventId)}">
          チケットページへ
        </a>
      </div>
    </article>
  `).join("");
}

function showAuthNotice() {
  $("authNotice").classList.remove("hidden");
  $("ticketSection").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function showTicketSection() {
  $("authNotice").classList.add("hidden");
  $("ticketSection").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  if (currentUser) {
    $("userName").textContent = currentUser.name;
    $("userEmail").textContent = currentUser.email;
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "index.html";
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) {
  return escapeHtml(str);
}
