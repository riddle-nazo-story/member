// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbzAAVNMkySPZaIYtVPtpuG4h9DtbhDPpAjy0FvTmwoLiWkN--KCXiiPTMLyKWxqlLeD/exec";

const TOKEN_KEY = "rs_member_token";
const RETURN_TO_KEY = "rs_return_to";

const $ = (id) => document.getElementById(id);

let currentUser = null;
let qrScanner = null;
let qrBusy = false;

// ページ切り替え用
let ticketPageIndex = 0;
let ticketItemsCache = [];

let stampPageIndex = 0;
let stampItemsCache = [];

const TICKETS_PER_PAGE = 3;
const STAMPS_PER_PAGE = 5;

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

function renderEmailArea(user) {
  const verified = !!user.emailVerified;

  if ($("emailVerifyCard")) {
    $("emailVerifyCard").classList.remove("hidden");
  }

  if ($("emailStatusText")) {
    $("emailStatusText").textContent = verified
      ? "メール認証済みです。"
      : "メール未認証です。チケット発行・スタンプ取得などを利用するには、メール認証を完了してください。";
  }

  if ($("emailVerifyForm")) {
    $("emailVerifyForm").classList.toggle("hidden", verified);
  }

  if ($("campaignMailCard")) {
    $("campaignMailCard").classList.remove("hidden");
  }

  if ($("memberCampaignOptIn")) {
    $("memberCampaignOptIn").checked = !!user.campaignOptIn;
  }
}

async function verifyEmailCode() {
  try {
    const code = $("emailVerifyCode") ? $("emailVerifyCode").value.trim() : "";

    if (!code) {
      showMessage("認証コードを入力してください。", "error");
      return;
    }

    const res = await api("verifyEmailCode", {
      token: getToken(),
      code,
    });

    currentUser = res.user;

    if ($("emailVerifyCode")) {
      $("emailVerifyCode").value = "";
    }

    showMessage(res.message || "メール認証が完了しました。", "ok");
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function resendEmailCode() {
  try {
    const res = await api("sendEmailVerificationCode", {
      token: getToken(),
    });

    currentUser = res.user;

    showMessage(res.message || "認証コードを再送信しました。", "ok");
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function saveCampaignOptIn() {
  try {
    const res = await api("updateCampaignOptIn", {
      token: getToken(),
      campaignOptIn: $("memberCampaignOptIn") ? $("memberCampaignOptIn").checked : false,
    });

    currentUser = res.user;

    showMessage(res.message || "メール配信設定を保存しました。", "ok");
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function bindEvents() {
  addClick("loginBtn", login);
  addClick("registerBtn", register);
  addClick("logoutBtn", logout);
  addClick("redeemStampBtn", redeemStamp);
  addClick("startQrBtn", startQr);
  addClick("stopQrBtn", stopQr);
  addClick("verifyEmailBtn", verifyEmailCode);
  addClick("resendEmailCodeBtn", resendEmailCode);
  addClick("saveCampaignOptInBtn", saveCampaignOptIn);

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

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

async function login() {
  try {
    const email = $("loginEmail").value.trim();
    const password = $("loginPassword").value;

    if (!email) {
      showMessage("メールアドレスを入力してください。", "error");
      return;
    }

    if (!isValidEmail(email)) {
      showMessage("メールアドレスの形式で入力してください。例：example@example.com", "error");
      return;
    }

    if (!password) {
      showMessage("パスワードを入力してください。", "error");
      return;
    }

    const res = await api("login", {
      email,
      password,
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
    const name = $("registerName").value.trim();
    const email = $("registerEmail").value.trim();
    const password = $("registerPassword").value;

    if (!name) {
      showMessage("表示名を入力してください。", "error");
      return;
    }

    if (!email) {
      showMessage("メールアドレスを入力してください。", "error");
      return;
    }

    if (!isValidEmail(email)) {
      showMessage("メールアドレスの形式で入力してください。例：example@example.com", "error");
      return;
    }

    if (!password) {
      showMessage("パスワードを入力してください。", "error");
      return;
    }

    const res = await api("register", {
      name,
      email,
      password,
      termsAgreed: $("termsAgreed").checked,
      privacyAgreed: $("privacyAgreed").checked,
      campaignOptIn: $("campaignOptIn") ? $("campaignOptIn").checked : false,
    });

    localStorage.setItem(TOKEN_KEY, res.token);
    currentUser = res.user;

    showMessage(res.message || "会員登録が完了しました。", "ok");

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
  currentUser = data.user;
renderEmailArea(data.user);

  renderTickets(data.tickets || []);
  renderParticipations(data.participations || []);
  renderStamps(data.stamps || []);
}

/* =========================
   ゲームURL：3件ずつ表示
========================= */

function renderTickets(tickets) {
  const root = $("myTickets");

  if (!root) return;

  if (!tickets || !tickets.length) {
    ticketItemsCache = [];
    ticketPageIndex = 0;
    root.innerHTML = `<p class="muted">まだチケットはありません。チケット購入サイトから発行してください。</p>`;
    return;
  }

  ticketItemsCache = tickets;
  ticketPageIndex = 0;

  renderTicketPage();
}

function renderTicketPage() {
  const root = $("myTickets");

  if (!root) return;

  const totalPages = Math.ceil(ticketItemsCache.length / TICKETS_PER_PAGE);
  const start = ticketPageIndex * TICKETS_PER_PAGE;
  const pageTickets = ticketItemsCache.slice(start, start + TICKETS_PER_PAGE);

  root.innerHTML = `
    <div class="mini-item paged-ticket-box">
      <div class="page-head">
        <div>
          <p class="eyebrow">GAME URL</p>
          <h3>発行済みゲームURL</h3>
        </div>
        <p class="muted">${ticketPageIndex + 1} / ${totalPages}</p>
      </div>

      <div class="ticket-page-list">
        ${pageTickets.map((t) => {
          const displayGameStatus = getDisplayGameStatus(t);

          return `
            <div class="ticket-page-item">
              <strong>${escapeHtml(t.eventTitle || t.eventId || "公演名なし")}</strong>

              ${t.gameUrl ? `
                <div class="button-row">
                  <a href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener" class="game-link">
                    ゲームを開く
                  </a>

                  <button type="button" class="copy-url-btn ghost" data-copy-url="${escapeAttr(t.gameUrl)}">
                    URLコピー
                  </button>
                </div>
              ` : `<p class="muted">ゲームURLなし</p>`}

              <p class="muted">
                会員状態：${statusText(t.status)}
                ${displayGameStatus ? ` / URL状態：${gameStatusText(displayGameStatus)}` : ""}
                ${t.gameExpiresAt ? ` / 期限：${formatDate(t.gameExpiresAt)}` : ""}
                ${t.usedAt ? ` / 使用日：${formatDate(t.usedAt)}` : ""}
              </p>
            </div>
          `;
        }).join("")}
      </div>

      ${renderPager(totalPages, ticketPageIndex, "ticket")}
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

/* =========================
   参加済み公演
========================= */

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

/* =========================
   スタンプ履歴：5件ずつ表示
========================= */

function renderStamps(stamps) {
  const root = $("myStamps");

  if (!root) return;

  if (!stamps || !stamps.length) {
    stampItemsCache = [];
    stampPageIndex = 0;
    root.innerHTML = `<p class="muted">まだスタンプ履歴はありません。</p>`;
    return;
  }

  stampItemsCache = stamps;
  stampPageIndex = 0;

  renderStampPage();
}

function renderStampPage() {
  const root = $("myStamps");

  if (!root) return;

  const totalPages = Math.ceil(stampItemsCache.length / STAMPS_PER_PAGE);
  const start = stampPageIndex * STAMPS_PER_PAGE;
  const pageStamps = stampItemsCache.slice(start, start + STAMPS_PER_PAGE);

  root.innerHTML = `
    <div class="mini-item paged-stamp-box">
      <div class="page-head">
        <div>
          <p class="eyebrow">STAMP HISTORY</p>
          <h3>スタンプ履歴</h3>
        </div>
        <p class="muted">${stampPageIndex + 1} / ${totalPages}</p>
      </div>

      <div class="stamp-page-list">
        ${pageStamps.map((stamp) => {
          const acquiredAt = stamp.redeemedAt || stamp.usedAt || stamp.createdAt || "";

          return `
            <div class="stamp-page-item">
              <strong>${escapeHtml(stamp.stampName || stamp.eventTitle || "スタンプ")}</strong>

              <p class="muted">
                ${stamp.eventTitle ? `公演：${escapeHtml(stamp.eventTitle)}` : ""}
                ${stamp.point !== undefined && stamp.point !== "" ? ` / +${escapeHtml(stamp.point)}pt` : ""}
                ${acquiredAt ? ` / 取得日：${formatDate(acquiredAt)}` : ""}
              </p>
            </div>
          `;
        }).join("")}
      </div>

      ${renderPager(totalPages, stampPageIndex, "stamp")}
    </div>
  `;

  root.querySelectorAll("[data-stamp-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      stampPageIndex = Number(btn.dataset.stampPage);
      renderStampPage();
    });
  });
}

/* =========================
   数字ボタン
========================= */

function renderPager(totalPages, current, type) {
  if (totalPages <= 1) return "";

  const buttons = Array.from({ length: totalPages }, (_, i) => {
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

/* =========================
   タブ・表示切替
========================= */

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

/* =========================
   表示用テキスト
========================= */

function getDisplayGameStatus(ticket) {
  const status = ticket.gameStatus || "";

  if (!ticket.gameExpiresAt) {
    return status;
  }

  const expiresAt = new Date(ticket.gameExpiresAt);

  if (Number.isNaN(expiresAt.getTime())) {
    return status;
  }

  const now = new Date();
  const isExpired = expiresAt.getTime() <= now.getTime();

  if (!isExpired) {
    return status;
  }

  if (status === "cleared" || status === "blocked" || status === "expired") {
    return status;
  }

  return "expired";
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

/* =========================
   共通
========================= */

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showMessage("ゲームURLをコピーしました。", "ok");
  } catch (err) {
    window.prompt("このURLをコピーしてください", url);
  }
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
