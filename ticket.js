// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const $ = (id) => document.getElementById(id);

let currentUser = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", logout);
  }

  const token = getToken();

  if (!token) {
    showAuthNotice();
    await loadEvents();
    return;
  }

  try {
    const res = await api("me", { token });
    currentUser = res.user;

    showTicketSection();
    await loadEvents();
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;

    showAuthNotice();
    await loadEvents();
  }
}

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({
      action,
      data,
    }),
  });

  const json = await res.json();

  if (!json.ok) {
    throw new Error(json.error || "通信エラーが発生しました。");
  }

  return json.result;
}

async function loadEvents() {
  try {
    const events = await api("listEvents");
    renderEvents(events);
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderEvents(events) {
  const root = $("eventsList");

  if (!root) return;

  if (!events.length) {
    root.innerHTML = `<p class="muted">現在公開中の公演はありません。</p>`;
    return;
  }

  root.innerHTML = events.map((event) => `
    <article class="card event-card">
      <div class="event-thumb-wrap">
        ${
          event.mainVisualUrl
            ? `<img class="event-thumb" src="${escapeAttr(event.mainVisualUrl)}" alt="${escapeAttr(event.title)}" loading="lazy" />`
            : `<div class="event-thumb no-thumb">NO IMAGE</div>`
        }
      </div>

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
  if ($("authNotice")) {
    $("authNotice").classList.remove("hidden");

    const returnTo = encodeURIComponent(location.href);

    $("authNotice").innerHTML = `
      <h2>ログインが必要です</h2>
      <p class="muted">
        チケットの購入・発行にはログインが必要です。
        公演一覧はログインなしでも確認できます。
      </p>
      <a href="index.html?returnTo=${returnTo}" class="game-link">
        ログインして続ける
      </a>
    `;
  }

  if ($("ticketSection")) {
    $("ticketSection").classList.remove("hidden");
  }

  if ($("logoutBtn")) {
    $("logoutBtn").classList.add("hidden");
  }

  if ($("userName")) {
    $("userName").textContent = "未ログイン";
  }

  if ($("userEmail")) {
    $("userEmail").textContent = "購入・発行にはログインが必要です。";
  }
}

function showTicketSection() {
  if ($("authNotice")) {
    $("authNotice").classList.add("hidden");
  }

  if ($("ticketSection")) {
    $("ticketSection").classList.remove("hidden");
  }

  if ($("logoutBtn")) {
    $("logoutBtn").classList.remove("hidden");
  }

  if (currentUser) {
    if ($("userName")) {
      $("userName").textContent = currentUser.name;
    }

    if ($("userEmail")) {
      $("userEmail").textContent = currentUser.email;
    }
  }
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "index.html";
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function showMessage(text, type = "ok") {
  const el = $("message");

  if (!el) {
    alert(text);
    return;
  }

  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove("hidden");

  setTimeout(() => {
    el.classList.add("hidden");
  }, 4500);
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
