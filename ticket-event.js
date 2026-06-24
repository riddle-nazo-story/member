// GASのWebアプリURLに変更してください
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentEvent = null;
let confirmMode = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("logoutBtn").addEventListener("click", logout);
  $("showConfirmBtn").addEventListener("click", showFreeConfirm);
  $("showPaidConfirmBtn").addEventListener("click", showPaidConfirm);
  $("confirmIssueBtn").addEventListener("click", confirmAction);
  $("backBtn").addEventListener("click", hideConfirm);

  const token = getToken();
  if (!token) {
    showAuthNotice();
    return;
  }

  try {
    const me = await api("me", { token });
    currentUser = me.user;
    $("logoutBtn").classList.remove("hidden");
    await loadEvent();
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

async function loadEvent() {
  const eventId = new URLSearchParams(location.search).get("eventId");
  const events = await api("listEvents");
  currentEvent = events.find((e) => e.eventId === eventId);

  if (!currentEvent) {
    $("notFound").classList.remove("hidden");
    return;
  }

  renderEvent(currentEvent);
}

function renderEvent(event) {
  $("eventSection").classList.remove("hidden");
  $("eventTitle").textContent = event.title;
  $("eventDescription").textContent = event.description || "";
  $("eventTypeText").textContent = event.type === "free" ? "FREE TICKET" : "PAID TICKET";

  if (event.mainVisualUrl) {
    $("mainVisual").src = event.mainVisualUrl;
    $("mainVisual").classList.remove("hidden");
  }

  $("eventStory").innerHTML = formatMultiline(event.story || "ストーリーはまだ登録されていません。");
  $("eventNotes").innerHTML = formatMultiline(event.notes || "注意事項はまだ登録されていません。");

  if (event.type === "free") {
    $("freeArea").classList.remove("hidden");
    $("paidArea").classList.add("hidden");
    renderCountSelect(Number(event.maxFreeTickets || 1));
  } else {
    $("paidArea").classList.remove("hidden");
    $("freeArea").classList.add("hidden");

    if (event.shopUrl) {
      $("shopLink").href = event.shopUrl;
      $("shopLink").classList.remove("hidden");
    } else {
      $("shopLink").classList.add("hidden");
    }
  }
}

function renderCountSelect(max) {
  const safeMax = Math.max(1, Math.min(10, max));
  let html = "";

  for (let i = 1; i <= safeMax; i++) {
    html += `<option value="${i}">${i}枚</option>`;
  }

  $("ticketCount").innerHTML = html;
}

function showFreeConfirm() {
  confirmMode = "free";
  const count = Number($("ticketCount").value || 1);
  $("confirmText").innerHTML = `
    <p><strong>公演名：</strong>${escapeHtml(currentEvent.title)}</p>
    <p><strong>種別：</strong>無料チケット発行</p>
    <p><strong>発行枚数：</strong>${count}枚</p>
    <p class="muted">確定すると、ゲーム用token付きURLが発行されます。</p>
  `;
  $("confirmArea").classList.remove("hidden");
  $("confirmArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPaidConfirm() {
  const code = $("paidCode").value.trim();
  if (!code) {
    showMessage("購入後コードを入力してください。", "error");
    return;
  }

  confirmMode = "paid";
  $("confirmText").innerHTML = `
    <p><strong>公演名：</strong>${escapeHtml(currentEvent.title)}</p>
    <p><strong>種別：</strong>有料コード認証</p>
    <p><strong>入力コード：</strong><span class="code">${escapeHtml(code)}</span></p>
    <p class="muted">この内容で認証します。認証に成功するとプレイURLを開きます。</p>
  `;
  $("confirmArea").classList.remove("hidden");
  $("confirmArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

function hideConfirm() {
  confirmMode = null;
  $("confirmArea").classList.add("hidden");
}

async function confirmAction() {
  if (confirmMode === "free") {
    await issueFreeTickets();
  } else if (confirmMode === "paid") {
    await verifyPaidCode();
  }
}

async function issueFreeTickets() {
  try {
    const count = Number($("ticketCount").value || 1);
    const res = await api("issueFreeTickets", {
      token: getToken(),
      eventId: currentEvent.eventId,
      count,
    });

    hideConfirm();
    showMessage("ゲームURLを発行しました。", "ok");
    renderResult(res.tickets);
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function verifyPaidCode() {
  try {
    const code = $("paidCode").value.trim();
    const res = await api("verifyPaidCode", {
      token: getToken(),
      eventId: currentEvent.eventId,
      code,
    });

    hideConfirm();
    showMessage("認証に成功しました。", "ok");

    if (res.playUrl) {
      window.open(res.playUrl, "_blank", "noopener");
    }
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderResult(tickets) {
  $("resultArea").classList.remove("hidden");
  $("resultList").innerHTML = `
    <div class="mini-list">
      ${tickets.map((t) => `
        <div class="mini-item">
          <p>会員チケット：<span class="code">${escapeHtml(t.ticketCode)}</span></p>
          ${t.gameUrl ? `<p><span class="code">${escapeHtml(t.gameUrl)}</span></p><p><a class="game-link" href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener">ゲームを開く</a> <button type="button" class="copy-url-btn ghost" data-copy-url="${escapeAttr(t.gameUrl)}">URLコピー</button></p>` : ""}
        </div>
      `).join("")}
    </div>
  `;

  $("resultList").querySelectorAll(".copy-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyUrl(btn.dataset.copyUrl));
  });

  $("resultArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showAuthNotice() {
  $("authNotice").classList.remove("hidden");
  $("eventSection").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
}

function logout() {
  localStorage.removeItem(TOKEN_KEY);
  location.href = "index.html";
}

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showMessage("ゲームURLをコピーしました。", "ok");
  } catch (err) {
    window.prompt("このURLをコピーしてください", url);
  }
}

function formatMultiline(text) {
  return escapeHtml(text).split("\n").filter(Boolean).map((line) => `<p>${line}</p>`).join("");
}

function showMessage(text, type = "ok") {
  const el = $("message");
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
