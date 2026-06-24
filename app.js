// GASのWebアプリURLに変更してください
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const $ = (id) => document.getElementById(id);

let currentUser = null;
let qrScanner = null;
let qrBusy = false;

document.addEventListener("DOMContentLoaded", init);

async function init() {
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
      showAuth();
    }
  } else {
    showAuth();
  }
}

function bindEvents() {
  $("loginBtn").addEventListener("click", login);
  $("registerBtn").addEventListener("click", register);
  $("logoutBtn").addEventListener("click", logout);
  $("redeemStampBtn").addEventListener("click", redeemStamp);
  $("startQrBtn").addEventListener("click", startQr);
  $("stopQrBtn").addEventListener("click", stopQr);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });
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

async function login() {
  try {
    const res = await api("login", {
      email: $("loginEmail").value,
      password: $("loginPassword").value,
    });

    localStorage.setItem(TOKEN_KEY, res.token);
    currentUser = res.user;

    showMessage("ログインしました。", "ok");
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

    $("qrReader").classList.remove("hidden");
    $("startQrBtn").classList.add("hidden");
    $("stopQrBtn").classList.remove("hidden");

    qrScanner = new Html5Qrcode("qrReader");

    await qrScanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 240, height: 240 } },
      async (decodedText) => {
        if (qrBusy) return;
        qrBusy = true;
        $("stampCodeInput").value = decodedText;
        await stopQr();
        await redeemStamp();
        setTimeout(() => { qrBusy = false; }, 1200);
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
    const stampCode = $("stampCodeInput").value.trim();

    const res = await api("redeemStampCode", {
      token: getToken(),
      stampCode,
    });

    $("stampCodeInput").value = "";
    showMessage(`${res.stampName || res.event.title} のスタンプを取得しました。 +${res.point}pt`, "ok");
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function loadMyData() {
  const data = await api("getMyData", { token: getToken() });

  $("userName").textContent = data.user.name;
  $("userEmail").textContent = data.user.email;
  $("totalPoint").textContent = data.totalPoint;

  renderTickets(data.tickets);
  renderParticipations(data.participations);
  renderStamps(data.stamps);
}

function renderTickets(tickets) {
  const root = $("myTickets");

  if (!tickets.length) {
    root.innerHTML = `<p class="muted">まだチケットはありません。チケット購入サイトから発行してください。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="mini-list">
      ${tickets.map((t) => `
        <div class="mini-item">
          <strong>${escapeHtml(t.eventTitle)}</strong>
          <p>会員チケット：<span class="code">${escapeHtml(t.ticketCode)}</span></p>
          ${t.gameUrl ? `<p><span class="code">${escapeHtml(t.gameUrl)}</span></p><p><a class="game-link" href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener">ゲームを開く</a> <button type="button" class="copy-url-btn ghost" data-copy-url="${escapeAttr(t.gameUrl)}">URLコピー</button></p>` : ""}
          <p class="muted">
            会員状態：${statusText(t.status)} / ゲーム状態：${gameStatusText(t.gameStatus)}
            ${t.gameExpiresAt ? " / URL期限：" + formatDate(t.gameExpiresAt) : ""}
            ${t.usedAt ? " / 使用日：" + formatDate(t.usedAt) : ""}
          </p>
          <p class="muted">発行日：${formatDate(t.createdAt)}</p>
        </div>
      `).join("")}
    </div>
  `;

  root.querySelectorAll(".copy-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyUrl(btn.dataset.copyUrl));
  });
}

function renderParticipations(list) {
  const root = $("myParticipations");

  if (!list.length) {
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

  if (!stamps.length) {
    root.innerHTML = `<p class="muted">まだスタンプはありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="mini-list">
      ${stamps.map((s) => `
        <div class="mini-item">
          <strong>${escapeHtml(s.eventTitle)}</strong>
          <p>${Number(s.point)} pt</p>
          <p class="muted">${formatDate(s.createdAt)}</p>
        </div>
      `).join("")}
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

  $(`tab-${tab}`).classList.remove("hidden");
  if (tab !== "stamp") stopQr();
}

function showAuth() {
  $("authSection").classList.remove("hidden");
  $("memberSection").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function showMember() {
  $("authSection").classList.add("hidden");
  $("memberSection").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
}

function getToken() { return localStorage.getItem(TOKEN_KEY); }

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
  const map = { issued: "未使用", used: "使用済み", cancelled: "キャンセル済み" };
  return map[status] || status;
}

function sourceText(source) {
  const map = { ticket: "チケット使用", paid: "有料認証", stamp: "スタンプ", manual: "手動登録" };
  return map[source] || source;
}

function showMessage(text, type = "ok") {
  const el = $("message");
  el.textContent = text;
  el.className = `message ${type}`;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4500);
}

function formatDate(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
}

function escapeHtml(str) {
  return String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(str) { return escapeHtml(str); }
