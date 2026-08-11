// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbx68_hw9Zon-CVBIvyrGGnlL2uDGBKJOGkNvXtFx1bBtI1CcrAM2K1nHyn3-Xvq7UAczA/exec";

const TOKEN_KEY = "rs_member_token";
const $ = (id) => document.getElementById(id);

let currentUser = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("logoutBtn")?.addEventListener("click", logout);

  window.RSLoader?.show({
    label: "SEARCHING THE ARCHIVE",
    title: "公開された物語を探索しています",
    text: "ログイン状態を確認しています……",
  });

  try {
    await restoreLoginState();

    window.RSLoader?.update({
      label: "SEARCHING THE ARCHIVE",
      title: "公開された物語を探索しています",
      text: "スプレッドシートから公演一覧を読み込んでいます……",
    });

    await loadEvents();
  } finally {
    window.RSLoader?.hide();
  }
}

async function restoreLoginState() {
  const token = getToken();

  if (!token) {
    showAuthNotice();
    return;
  }

  try {
    const res = await api("me", { token });
    currentUser = res.user;
    showTicketSection();
  } catch (err) {
    localStorage.removeItem(TOKEN_KEY);
    currentUser = null;
    showAuthNotice();
  }
}

async function api(action, data = {}) {
  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, data }),
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
    renderEvents(Array.isArray(events) ? events : []);
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

  root.innerHTML = events.map((event) => {
    const escapeLinked = isEscapeIdEvent(event);
    const badge = escapeLinked
      ? `<span class="badge escape-id-badge">ESCAPE.ID</span>`
      : `<span class="badge ${event.type === "free" ? "free" : "paid"}">${event.type === "free" ? "無料" : "有料"}</span>`;

    return `
      <article class="card event-card ${escapeLinked ? "is-escape-id" : ""}">
        <div class="event-thumb-wrap">
          ${
            event.mainVisualUrl
              ? `<img class="event-thumb" src="${escapeAttr(event.mainVisualUrl)}" alt="${escapeAttr(event.title)}" loading="lazy" />`
              : `<div class="event-thumb no-thumb">NO IMAGE</div>`
          }
        </div>

        <div class="event-info">
          <div class="event-badge-row">${badge}</div>
          <h3>${escapeHtml(event.title)}</h3>
          <p class="muted">${escapeHtml(event.description || "")}</p>

          <a class="game-link" href="ticket-event.html?eventId=${encodeURIComponent(event.eventId)}">
            詳細・チケットを見る
          </a>
        </div>
      </article>
    `;
  }).join("");
}

function isEscapeIdEvent(event) {
  return String(event.ticketProvider || "member") === "escape_id";
}

function showAuthNotice() {
  $("authNotice")?.classList.remove("hidden");
  $("ticketSection")?.classList.remove("hidden");
  $("logoutBtn")?.classList.add("hidden");

  if ($("userName")) $("userName").textContent = "未ログイン";
  if ($("userEmail")) {
    $("userEmail").textContent = "会員チケットの発行・認証時にログインが必要です。";
  }
}

function showTicketSection() {
  $("authNotice")?.classList.add("hidden");
  $("ticketSection")?.classList.remove("hidden");
  $("logoutBtn")?.classList.remove("hidden");

  if (currentUser) {
    if ($("userName")) $("userName").textContent = currentUser.name || "会員";
    if ($("userEmail")) $("userEmail").textContent = currentUser.email || "";
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

  setTimeout(() => el.classList.add("hidden"), 4500);
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
