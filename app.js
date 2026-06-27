// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const RETURN_TO_KEY = "rs_return_to";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let qrScanner = null;
let qrBusy = false;

let ticketPageIndex = 0;
let ticketGroupsCache = [];

let stampPageIndex = 0;
let stampGroupsCache = [];

document.addEventListener("DOMContentLoaded", init);

async function init() {
  const params = new URLSearchParams(location.search);
  const returnTo = params.get("returnTo");

  if (returnTo) {
    sessionStorage.setItem(RETURN_TO_KEY, returnTo);
  }

  bindEvents();

  const token = getToken();

  if (token) {
    try {
      const res = await api("me", { token });
      currentUser = res.user;
      showMember();
      await loadMyData();
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      currentUser = null;
      showAuth();
    }
  } else {
    showAuth();
  }
}

function bindEvents() {
  addClick("loginBtn", login);
  addClick("registerBtn", register);
  addClick("logoutBtn", logout);
  addClick("redeemStampBtn", redeemStamp);
  addClick("startQrBtn", startQr);
  addClick("stopQrBtn", stopQr);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
}

function addClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", fn);
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

async function login() {
  try {
    const res = await api("login", {
      email: $("loginEmail").value,
      password: $("loginPassword").value,
    });

    localStorage.setItem(TOKEN_KEY, res.token);
    currentUser = res.user;

    showMessage("ログインしました。", "ok");

    if (redirectAfterLoginIfNeeded()) {
      return;
    }

    showMember();
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function register() {
  try {
    const res = await api("register", {
      name: $("registerName").value,
      email: $("registerEmail").value,
      password: $("registerPassword").value,
      termsAgreed: $("termsAgreed").checked,
      privacyAgreed: $("privacyAgreed").checked,
    });

    localStorage.setItem(TOKEN_KEY, res.token);
    currentUser = res.user;

    showMessage("会員登録が完了しました。", "ok");

    if (redirectAfterLoginIfNeeded()) {
      return;
    }

    showMember();
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function logout() {
  stopQr();
  localStorage.removeItem(TOKEN_KEY);
  currentUser = null;
  showAuth();
}

async function startQr() {
  try {
    if (!window.Html5Qrcode) {
      showMessage("QR読み取りライブラリの読み込みに失敗しました。手動入力を使ってください。", "error");
      return;
    }

    if ($("qrReader")) $("qrReader").classList.remove("hidden");
    if ($("startQrBtn")) $("startQrBtn").classList.add("hidden");
    if ($("stopQrBtn")) $("stopQrBtn").classList.remove("hidden");

    qrScanner = new Html5Qrcode("qrReader");

    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        if (qrBusy) return;

        qrBusy = true;

        if ($("stampCodeInput")) {
          $("stampCodeInput").value = decodedText;
        }

        await stopQr();
        await redeemStamp();

        setTimeout(() => {
          qrBusy = false;
        }, 1200);
      },
      () => {}
    );
  } catch (err) {
    showMessage("カメラを起動できませんでした。権限を許可するか、手動入力を使ってください。", "error");
    await stopQr();
  }
}

async function stopQr() {
  try {
    if (qrScanner) {
      await qrScanner.stop();
      await qrScanner.clear();
    }
  } catch (err) {
  } finally {
    qrScanner = null;

    if ($("qrReader")) $("qrReader").classList.add("hidden");
    if ($("startQrBtn")) $("startQrBtn").classList.remove("hidden");
    if ($("stopQrBtn")) $("stopQrBtn").classList.add("hidden");
  }
}

async function redeemStamp() {
  try {
    const rawValue = $("stampCodeInput") ? $("stampCodeInput").value.trim() : "";
    const stampCode = extractStampCode(rawValue);

    if (!stampCode) {
      showMessage("スタンプコードを入力してください。", "error");
      return;
    }

    const res = await api("redeemStampCode", {
      token: getToken(),
      stampCode,
    });

    if ($("stampCodeInput")) {
      $("stampCodeInput").value = "";
    }

    const stampName = res.stampName || res.event?.title || "スタンプ";
    showMessage(`${stampName} を取得しました。 +${res.point}pt`, "ok");

    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function extractStampCode(value) {
  if (!value) return "";

  try {
    const url = new URL(value);
    return url.searchParams.get("code") || url.searchParams.get("stampCode") || value;
  } catch (err) {
    return value;
  }
}

async function loadMyData() {
  const data = await api("getMyData", {
    token: getToken(),
  });

  if ($("userName")) $("userName").textContent = data.user.name;
  if ($("userEmail")) $("userEmail").textContent = data.user.email;
  if ($("totalPoint")) $("totalPoint").textContent = data.totalPoint;

  renderTickets(data.tickets || []);
  renderParticipations(data.participations || []);
  renderStamps(data.stamps || []);
}

function renderTickets(tickets) {
  const root = $("myTickets");

  if (!root) return;

  if (!tickets || !tickets.length) {
    ticketGroupsCache = [];
    ticketPageIndex = 0;
    root.innerHTML = `<p class="muted">まだチケットはありません。チケット購入サイトから発行してください。</p>`;
    return;
  }

  const grouped = {};

  tickets.forEach((ticket) => {
    const eventTitle = ticket.eventTitle || ticket.eventId || "未分類";

    if (!grouped[eventTitle]) {
      grouped[eventTitle] = [];
    }

    grouped[eventTitle].push(ticket);
  });

  ticketGroupsCache = Object.keys(grouped).map((eventTitle) => ({
    eventTitle,
    tickets: grouped[eventTitle],
  }));

  if (ticketPageIndex >= ticketGroupsCache.length) {
    ticketPageIndex = 0;
  }

  renderTicketPage();
}

function renderTicketPage() {
  const root = $("myTickets");

  if (!root) return;

  const group = ticketGroupsCache[ticketPageIndex];

  if (!group) {
    root.innerHTML = `<p class="muted">まだチケットはありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="mini-item paged-ticket-box">
      <div class="page-head">
        <div>
          <p class="eyebrow">GAME URL</p>
          <h3>${escapeHtml(group.eventTitle)}</h3>
        </div>
        <p class="muted">${ticketPageIndex + 1} / ${ticketGroupsCache.length}</p>
      </div>

      <div class="ticket-page-list">
        ${group.tickets.map((t) => `
          <div class="ticket-page-item">
            ${t.gameUrl ? `
              <div class="button-row">
                <a href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener" class="game-link">
                  ゲームを開く
                </a>

                <button type="button" class="copy-url-btn ghost" data-copy-url="${escapeAttr(t.gameUrl)}">
                  URLコピー
                </button>
              </div>
            ` : `<span class="muted">ゲームURLなし</span>`}

            <p class="muted">
              会員状態：${statusText(t.status)}
              ${t.gameStatus ? ` / URL状態：${gameStatusText(t.gameStatus)}` : ""}
              ${t.gameExpiresAt ? ` / 期限：${formatDate(t.gameExpiresAt)}` : ""}
              ${t.usedAt ? ` / 使用日：${formatDate(t.usedAt)}` : ""}
            </p>
          </div>
        `).join("")}
      </div>

      ${renderPager(ticketGroupsCache.length, ticketPageIndex, "ticket")}
    </div>
  `;

  root.querySelectorAll(".copy-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyUrl(btn.dataset.copyUrl));
  });

  root.querySelectorAll("[data-ticket-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ticketPageIndex = Number(btn.dataset.ticketPage);
      renderTicketPage();
    });
  });
}

function renderParticipations(list) {
  const root = $("myParticipations");

  if (!root) return;

  if (!list || !list.length) {
    root.innerHTML = `<p class="muted">参加済み公演はまだありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="mini-list">
      ${list.map((p) => `
        <div class="mini-item">
          <strong>${escapeHtml(p.eventTitle)}</strong>
          <p class="muted">${sourceText(p.source)} / ${formatDate(p.createdAt)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function renderStamps(stamps) {
  const root = $("myStamps");

  if (!root) return;

  if (!stamps || !stamps.length) {
    stampGroupsCache = [];
    stampPageIndex = 0;
    root.innerHTML = `<p class="muted">まだスタンプ履歴はありません。</p>`;
    return;
  }

  const grouped = {};

  stamps.forEach((stamp) => {
    const eventTitle = stamp.eventTitle || stamp.title || "未分類";

    if (!grouped[eventTitle]) {
      grouped[eventTitle] = [];
    }

    grouped[eventTitle].push(stamp);
  });

  stampGroupsCache = Object.keys(grouped).map((eventTitle) => ({
    eventTitle,
    stamps: grouped[eventTitle],
  }));

  if (stampPageIndex >= stampGroupsCache.length) {
    stampPageIndex = 0;
  }

  renderStampPage();
}

function renderStampPage() {
  const root = $("myStamps");

  if (!root) return;

  const group = stampGroupsCache[stampPageIndex];

  if (!group) {
    root.innerHTML = `<p class="muted">まだスタンプ履歴はありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="mini-item paged-stamp-box">
      <div class="page-head">
        <div>
          <p class="eyebrow">STAMP HISTORY</p>
          <h3>${escapeHtml(group.eventTitle)}</h3>
        </div>
        <p class="muted">${stampPageIndex + 1} / ${stampGroupsCache.length}</p>
      </div>

      <div class="stamp-page-list">
        ${group.stamps.map((stamp) => {
          const acquiredAt = stamp.redeemedAt || stamp.usedAt || stamp.createdAt || "";

          return `
            <div class="stamp-page-item">
              <strong>${escapeHtml(stamp.stampName || stamp.eventTitle || "スタンプ")}</strong>

              <p class="muted">
                ${stamp.point !== undefined && stamp.point !== "" ? `+${escapeHtml(stamp.point)}pt` : ""}
                ${acquiredAt ? ` / 取得日：${formatDate(acquiredAt)}` : ""}
              </p>
            </div>
          `;
        }).join("")}
      </div>

      ${renderPager(stampGroupsCache.length, stampPageIndex, "stamp")}
    </div>
  `;

  root.querySelectorAll("[data-stamp-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stampPageIndex = Number(btn.dataset.stampPage);
      renderStampPage();
    });
  });
}

function renderPager(total, current, type) {
  if (total <= 1) return "";

  const buttons = Array.from({ length: total }, (_, i) => {
    const active = i === current ? "active" : "";

    if (type === "ticket") {
      return `<button type="button" class="page-btn ${active}" data-ticket-page="${i}">${i + 1}</button>`;
    }

    if (type === "stamp") {
      return `<button type="button" class="page-btn ${active}" data-stamp-page="${i}">${i + 1}</button>`;
    }

    return "";
  }).join("");

  return `
    <div class="page-buttons">
      ${buttons}
    </div>
  `;
}

function switchTab(tab) {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });

  const target = $(`tab-${tab}`);

  if (target) {
    target.classList.remove("hidden");
  }

  if (tab !== "stamp") {
    stopQr();
  }
}

function showAuth() {
  if ($("authSection")) $("authSection").classList.remove("hidden");
  if ($("memberSection")) $("memberSection").classList.add("hidden");
  if ($("logoutBtn")) $("logoutBtn").classList.add("hidden");
}

function showMember() {
  if ($("authSection")) $("authSection").classList.add("hidden");
  if ($("memberSection")) $("memberSection").classList.remove("hidden");
  if ($("logoutBtn")) $("logoutBtn").classList.remove("hidden");
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function gameStatusText(status) {
  const map = {
    unused: "未アクセス",
    active: "使用中",
    used: "使用済み",
    expired: "期限切れ・使用不可",
    cleared: "クリア済み",
    blocked: "無効",
  };

  return map[status] || status || "未アクセス";
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showMessage("ゲームURLをコピーしました。", "ok");
  } catch (err) {
    window.prompt("このURLをコピーしてください", url);
  }
}

function statusText(status) {
  const map = {
    issued: "未使用",
    used: "使用済み",
    cancelled: "キャンセル済み",
  };

  return map[status] || status;
}

function sourceText(source) {
  const map = {
    ticket: "チケット使用",
    paid: "有料認証",
    stamp: "スタンプ",
    manual: "手動登録",
  };

  return map[source] || source;
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

function formatDate(value) {
  if (!value) return "";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
  });
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

function redirectAfterLoginIfNeeded() {
  const returnTo = sessionStorage.getItem(RETURN_TO_KEY);

  if (!returnTo) return false;

  sessionStorage.removeItem(RETURN_TO_KEY);
  location.href = returnTo;
  return true;
}
