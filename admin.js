// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbx68_hw9Zon-CVBIvyrGGnlL2uDGBKJOGkNvXtFx1bBtI1CcrAM2K1nHyn3-Xvq7UAczA/exec";

const ADMIN_TOKEN_KEY = "rs_admin_token";
const CAMPAIGN_MAIL_STATE_KEY = "riddle_story_campaign_mail_state_v2";

const $ = (id) => document.getElementById(id);

// 要素がなくても止まらないようにする補助関数
function addClick(id, fn) {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", fn);
}

function setValue(id, value) {
  const el = $(id);
  if (!el) return;
  el.value = value ?? "";
}

function getValue(id, fallback = "") {
  const el = $(id);
  if (!el) return fallback;
  return el.value;
}

function setDisabled(id, disabled) {
  const el = $(id);
  if (!el) return;
  el.disabled = disabled;
}

function setText(id, text) {
  const el = $(id);
  if (!el) return;
  el.textContent = text;
}

function setHtml(id, html) {
  const el = $(id);
  if (!el) return;
  el.innerHTML = html;
}

function addHidden(id) {
  const el = $(id);
  if (!el) return;
  el.classList.add("hidden");
}

function removeHidden(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove("hidden");
}

let adminEvents = [];
let editingEventId = null;
let eventOrderDraft = [];
let eventOrderDirty = false;
let draggedEventId = null;
let argAccounts = [];
let selectedArgUserId = null;
let gameAccessPapers = [];
let lastIssuedAccessPapers = [];

document.addEventListener("DOMContentLoaded", initAdmin);

async function initAdmin() {
  addClick("adminLoginBtn", adminLogin);
  addClick("adminLogoutBtn", adminLogout);
  addClick("saveEventBtn", saveEvent);
  addClick("cancelEditEventBtn", cancelEventEdit);
  addClick("saveEventOrderBtn", saveEventOrder);
  addClick("parseEscapeApiBtn", parseEscapeApiUrl);
  addClick("generateStampBtn", generateStamp);
  addClick("useTicketBtn", useTicket);

  // ARGアカウント管理
  addClick("createArgAccountBtn", createArgAccount);
  addClick("refreshArgAccountsBtn", loadArgAccounts);
  addClick("closeArgEditorBtn", closeArgEditor);
  addClick("saveArgAccountBtn", saveArgAccount);
  addClick("deleteArgAccountBtn", deleteArgAccountAdmin);
  addClick("issueArgGameUrlBtn", issueArgGameUrl);
  addClick("addArgStampBtn", addArgStamp);

  // ゲームアクセス用紙
  addClick("issueAccessPapersBtn", issueAccessPapers);
  addClick("refreshAccessPapersBtn", loadAccessPapers);
  addClick("printAllAccessPapersBtn", printAllAccessPapers);

  // メール送信
  addClick("sendCampaignTestBtn", sendCampaignTest);
  addClick("sendCampaignMailBtn", sendCampaignMail);

  const providerSelect = $("eventTicketProvider");
  if (providerSelect) {
    providerSelect.addEventListener("change", syncTicketProviderFields);
  }
  syncTicketProviderFields();

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchAdminTab(btn.dataset.tab));
  });

  if (getAdminToken()) {
    showAdminMain();
    await refreshAdmin();
  } else {
    showAdminLogin();
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

async function adminLogin() {
  try {
    const res = await api("adminLogin", {
      password: getValue("adminPassword"),
    });

    localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
    showMessage("管理者ログインしました。");
    showAdminMain();
    await refreshAdmin();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function adminLogout() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
  showAdminLogin();
}

async function refreshAdmin() {
  await loadDashboard();
  await loadEvents();
  await loadStampCodes();
  await loadTickets();
  await loadUsers();
  await loadArgAccounts();
  await loadAccessPapers();
  await loadCampaignSubscribers();
  await loadCampaignMailQuota();
  syncCampaignMailProgress();
}

async function loadDashboard() {
  const data = await api("adminDashboard", {
    token: getAdminToken(),
  });

  setHtml("stats", `
    <div class="stat"><span>会員</span><strong>${escapeHtml(data.users)}</strong></div>
    <div class="stat"><span>認証済み</span><strong>${escapeHtml(data.emailVerifiedUsers || 0)}</strong></div>
    <div class="stat"><span>メール希望</span><strong>${escapeHtml(data.campaignSubscribers || 0)}</strong></div>
    <div class="stat"><span>公演</span><strong>${escapeHtml(data.events)}</strong></div>
    <div class="stat"><span>会員券</span><strong>${escapeHtml(data.tickets)}</strong></div>
    <div class="stat"><span>URL</span><strong>${escapeHtml(data.gameTickets)}</strong></div>
    <div class="stat"><span>有料</span><strong>${escapeHtml(data.paidAccess)}</strong></div>
    <div class="stat"><span>スタンプ</span><strong>${escapeHtml(data.stampCodes)}</strong></div>
    <div class="stat"><span>取得</span><strong>${escapeHtml(data.stampLogs)}</strong></div>
    <div class="stat"><span>アクセス用紙</span><strong>${escapeHtml(data.accessPapers || 0)}</strong></div>
  `);
}

async function loadEvents() {
  adminEvents = await api("adminListEvents", {
    token: getAdminToken(),
  });

  eventOrderDraft = adminEvents.map((event) => event.eventId);
  eventOrderDirty = false;

  renderEventOrderList();
  renderEventsTable(adminEvents);
  renderEventSelect(adminEvents);
  updateEventOrderSaveButton();
}

function getOrderedAdminEvents() {
  const eventMap = new Map(adminEvents.map((event) => [event.eventId, event]));

  return eventOrderDraft
    .map((eventId) => eventMap.get(eventId))
    .filter(Boolean);
}

function renderEventOrderList() {
  const root = $("eventOrderList");
  if (!root) return;

  const events = getOrderedAdminEvents();

  if (!events.length) {
    root.innerHTML = `<p class="muted">登録済み公演はありません。</p>`;
    return;
  }

  root.innerHTML = events.map((event, index) => `
    <article
      class="event-order-item"
      draggable="true"
      data-order-event="${escapeAttr(event.eventId)}"
    >
      <div class="event-order-position" aria-label="表示順 ${index + 1}">
        ${index + 1}
      </div>

      <div class="event-order-handle" aria-hidden="true" title="ドラッグして並び替え">
        <span></span><span></span><span></span>
      </div>

      <div class="event-order-main">
        <div class="event-order-title-row">
          <strong>${escapeHtml(event.title)}</strong>
          <span class="event-order-provider ${isEscapeIdAdminEvent(event) ? "is-escape-id" : "is-member"}">
            ${isEscapeIdAdminEvent(event) ? "ESCAPE.ID" : "会員サイト"}
          </span>
          <span class="event-order-status ${event.status === "public" ? "is-public" : "is-hidden"}">
            ${event.status === "public" ? "公開" : "非公開"}
          </span>
        </div>
        <span class="event-order-id">${escapeHtml(event.eventId)}</span>
      </div>

      <div class="event-order-actions">
        <button
          class="order-icon-btn ghost"
          type="button"
          data-move-event="${escapeAttr(event.eventId)}"
          data-direction="-1"
          aria-label="${escapeAttr(event.title)}を上へ移動"
          title="上へ"
          ${index === 0 ? "disabled" : ""}
        >↑</button>

        <button
          class="order-icon-btn ghost"
          type="button"
          data-move-event="${escapeAttr(event.eventId)}"
          data-direction="1"
          aria-label="${escapeAttr(event.title)}を下へ移動"
          title="下へ"
          ${index === events.length - 1 ? "disabled" : ""}
        >↓</button>

        <button
          class="small-btn"
          type="button"
          data-edit-order-event="${escapeAttr(event.eventId)}"
        >編集</button>
      </div>
    </article>
  `).join("");

  root.querySelectorAll("[data-move-event]").forEach((btn) => {
    btn.addEventListener("click", () => {
      moveEventOrder(btn.dataset.moveEvent, Number(btn.dataset.direction));
    });
  });

  root.querySelectorAll("[data-edit-order-event]").forEach((btn) => {
    btn.addEventListener("click", () => {
      startEventEdit(btn.dataset.editOrderEvent);
    });
  });

  root.querySelectorAll("[data-order-event]").forEach((item) => {
    item.addEventListener("dragstart", handleEventOrderDragStart);
    item.addEventListener("dragover", handleEventOrderDragOver);
    item.addEventListener("drop", handleEventOrderDrop);
    item.addEventListener("dragend", handleEventOrderDragEnd);
  });
}

function moveEventOrder(eventId, direction) {
  const currentIndex = eventOrderDraft.indexOf(eventId);
  if (currentIndex < 0) return;

  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= eventOrderDraft.length) return;

  const nextOrder = [...eventOrderDraft];
  [nextOrder[currentIndex], nextOrder[nextIndex]] = [nextOrder[nextIndex], nextOrder[currentIndex]];

  eventOrderDraft = nextOrder;
  markEventOrderDirty();
  renderEventOrderList();
}

function handleEventOrderDragStart(event) {
  const item = event.currentTarget;
  draggedEventId = item.dataset.orderEvent;
  item.classList.add("is-dragging");

  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", draggedEventId);
  }
}

function handleEventOrderDragOver(event) {
  event.preventDefault();

  const targetItem = event.currentTarget;
  const targetId = targetItem.dataset.orderEvent;

  if (!draggedEventId || draggedEventId === targetId) return;

  clearEventOrderDropTargets();

  const rect = targetItem.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;

  targetItem.classList.add(insertAfter ? "is-drop-after" : "is-drop-before");

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "move";
  }
}

function handleEventOrderDrop(event) {
  event.preventDefault();

  const targetItem = event.currentTarget;
  const targetId = targetItem.dataset.orderEvent;

  if (!draggedEventId || draggedEventId === targetId) {
    clearEventOrderDropTargets();
    return;
  }

  const draggedIndex = eventOrderDraft.indexOf(draggedEventId);
  const targetIndex = eventOrderDraft.indexOf(targetId);

  if (draggedIndex < 0 || targetIndex < 0) {
    clearEventOrderDropTargets();
    return;
  }

  const rect = targetItem.getBoundingClientRect();
  const insertAfter = event.clientY > rect.top + rect.height / 2;
  let destinationIndex = targetIndex + (insertAfter ? 1 : 0);

  const nextOrder = [...eventOrderDraft];
  nextOrder.splice(draggedIndex, 1);

  if (draggedIndex < destinationIndex) {
    destinationIndex -= 1;
  }

  nextOrder.splice(destinationIndex, 0, draggedEventId);

  eventOrderDraft = nextOrder;
  markEventOrderDirty();
  draggedEventId = null;
  renderEventOrderList();
}

function handleEventOrderDragEnd() {
  draggedEventId = null;
  clearEventOrderDropTargets();

  document.querySelectorAll(".event-order-item.is-dragging").forEach((item) => {
    item.classList.remove("is-dragging");
  });
}

function clearEventOrderDropTargets() {
  document.querySelectorAll(".event-order-item.is-drop-before, .event-order-item.is-drop-after").forEach((item) => {
    item.classList.remove("is-drop-before", "is-drop-after");
  });
}

function markEventOrderDirty() {
  eventOrderDirty = true;
  updateEventOrderSaveButton();
}

function updateEventOrderSaveButton() {
  const btn = $("saveEventOrderBtn");
  if (!btn) return;

  btn.disabled = !eventOrderDirty || eventOrderDraft.length === 0;
  btn.textContent = eventOrderDirty ? "変更した順番を保存" : "並び順を保存済み";
}

async function saveEventOrder() {
  if (!eventOrderDirty) return;

  const btn = $("saveEventOrderBtn");

  try {
    if (btn) btn.disabled = true;

    await api("adminReorderEvents", {
      token: getAdminToken(),
      eventIds: eventOrderDraft,
    });

    showMessage("イベントの表示順を保存しました。");
    await loadEvents();
  } catch (err) {
    showMessage(err.message, "error");
    updateEventOrderSaveButton();
  }
}

function renderEventSelect(events) {
  const select = $("stampEventId");
  if (!select) return;

  if (!events.length) {
    select.innerHTML = `<option value="">公演がありません</option>`;
    return;
  }

  select.innerHTML = events
    .map((e) => `<option value="${escapeAttr(e.eventId)}">${escapeHtml(e.title)} / ${escapeHtml(e.eventId)}</option>`)
    .join("");
}

function renderEventsTable(events) {
  const root = $("eventsTable");
  if (!root) return;

  if (!events.length) {
    root.innerHTML = `<p>登録済み公演はありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>順番</th>
            <th>操作</th>
            <th>チケットページ</th>
            <th>連携</th>
            <th>公演ID</th>
            <th>公演名</th>
            <th>種別</th>
            <th>状態</th>
            <th>ESCAPE公演ID</th>
            <th>ESCAPE会場ID</th>
            <th>gameId</th>
            <th>ゲーム公開URL</th>
            <th>URL有効時間</th>
            <th>ショップ</th>
            <th>有料コード</th>
            <th>プレイURL</th>
            <th>無料上限</th>
          </tr>
        </thead>
        <tbody>
          ${events.map((e) => `
            <tr>
              <td>${escapeHtml(e.displayOrder || "")}</td>
              <td>
                <button class="small-btn" type="button" data-edit-event="${escapeAttr(e.eventId)}">編集</button>
              </td>
              <td>${renderAdminTicketLink(e)}</td>
              <td>${isEscapeIdAdminEvent(e) ? "ESCAPE.ID" : "会員サイト"}</td>
              <td><span class="code">${escapeHtml(e.eventId)}</span></td>
              <td>${escapeHtml(e.title)}</td>
              <td>${escapeHtml(e.type)}</td>
              <td>${escapeHtml(e.status)}</td>
              <td><span class="code">${escapeHtml(e.escapeEventId || "")}</span></td>
              <td><span class="code">${escapeHtml(e.escapeLocationId || "")}</span></td>
              <td>${escapeHtml(e.gameId || "")}</td>
              <td>${e.gameBaseUrl ? `<a href="${escapeAttr(e.gameBaseUrl)}" target="_blank" rel="noopener">開く</a>` : ""}</td>
              <td>${escapeHtml(validHoursText(e.ticketValidHours, 24))}</td>
              <td>${e.shopUrl ? `<a href="${escapeAttr(e.shopUrl)}" target="_blank" rel="noopener">開く</a>` : ""}</td>
              <td><span class="code">${escapeHtml(e.paidCode || "")}</span></td>
              <td>${e.playUrl ? `<a href="${escapeAttr(e.playUrl)}" target="_blank" rel="noopener">開く</a>` : ""}</td>
              <td>${escapeHtml(e.maxFreeTickets || "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;

  root.querySelectorAll("[data-edit-event]").forEach((btn) => {
    btn.addEventListener("click", () => startEventEdit(btn.dataset.editEvent));
  });
}

function renderAdminTicketLink(event) {
  if (isEscapeIdAdminEvent(event)) {
    return event.escapePurchaseUrl
      ? `<a href="${escapeAttr(event.escapePurchaseUrl)}" target="_blank" rel="noopener">ESCAPE.IDを開く</a>`
      : `<span class="muted">URL未登録</span>`;
  }

  return `<a href="ticket-event.html?eventId=${encodeURIComponent(event.eventId)}" target="_blank" rel="noopener">開く</a>`;
}

function isEscapeIdAdminEvent(event) {
  return String(event.ticketProvider || "member") === "escape_id";
}

function startEventEdit(eventId) {
  const event = adminEvents.find((e) => e.eventId === eventId);

  if (!event) return;

  editingEventId = eventId;

  setText("eventFormTitle", "公演編集");

  setValue("eventId", event.eventId);
  setDisabled("eventId", true);

  setValue("eventTitle", event.title || "");
  setValue("eventType", event.type || "free");
  setValue("eventStatus", event.status || "public");
  setValue("eventTicketProvider", event.ticketProvider || "member");
  setValue("eventEscapeApiUrl", "");
  setValue("eventEscapeEventId", event.escapeEventId || "");
  setValue("eventEscapeLocationId", event.escapeLocationId || "");
  setValue("eventEscapePurchaseUrl", event.escapePurchaseUrl || "");
  setValue("eventShopUrl", event.shopUrl || "");
  setValue("eventPaidCode", event.paidCode || "");
  setValue("eventPlayUrl", event.playUrl || "");
  setValue("eventGameId", event.gameId || "");
  setValue("eventGameBaseUrl", event.gameBaseUrl || "");
  setValue("eventMainVisualUrl", event.mainVisualUrl || "");
  setValue("eventStory", event.story || "");
  setValue("eventNotes", event.notes || "");
  setValue("eventTicketValidHours", validHoursInputValue(event.ticketValidHours, 24));
  setValue("eventMaxFreeTickets", event.maxFreeTickets || "1");
  setValue("eventDescription", event.description || "");
  syncTicketProviderFields();

  setText("saveEventBtn", "公演を更新");
  removeHidden("cancelEditEventBtn");

  switchAdminTab("events");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function cancelEventEdit() {
  editingEventId = null;
  clearEventForm();
}

async function saveEvent() {
  try {
    const payload = {
      token: getAdminToken(),
      eventId: getValue("eventId"),
      title: getValue("eventTitle"),
      type: getValue("eventType", "free"),
      status: getValue("eventStatus", "public"),
      ticketProvider: getValue("eventTicketProvider", "member"),
      escapeEventId: getValue("eventEscapeEventId"),
      escapeLocationId: getValue("eventEscapeLocationId"),
      escapePurchaseUrl: getValue("eventEscapePurchaseUrl"),
      shopUrl: getValue("eventShopUrl"),
      paidCode: getValue("eventPaidCode"),
      playUrl: getValue("eventPlayUrl"),
      gameId: getValue("eventGameId"),
      gameBaseUrl: getValue("eventGameBaseUrl"),
      mainVisualUrl: getValue("eventMainVisualUrl"),
      story: getValue("eventStory"),
      notes: getValue("eventNotes"),
      ticketValidHours: getValue("eventTicketValidHours", "24"),
      maxFreeTickets: getValue("eventMaxFreeTickets", "1"),
      description: getValue("eventDescription"),
    };

    if (editingEventId) {
      await api("adminUpdateEvent", payload);
      showMessage("公演情報を更新しました。");
    } else {
      await api("adminCreateEvent", payload);
      showMessage("公演を登録しました。");
    }

    clearEventForm();
    await refreshAdmin();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function clearEventForm() {
  editingEventId = null;

  setText("eventFormTitle", "公演登録");

  setValue("eventId", "");
  setDisabled("eventId", false);

  setValue("eventTitle", "");
  setValue("eventType", "free");
  setValue("eventStatus", "public");
  setValue("eventTicketProvider", "member");
  setValue("eventEscapeApiUrl", "");
  setValue("eventEscapeEventId", "");
  setValue("eventEscapeLocationId", "");
  setValue("eventEscapePurchaseUrl", "");
  setValue("eventShopUrl", "");
  setValue("eventPaidCode", "");
  setValue("eventPlayUrl", "");
  setValue("eventGameId", "");
  setValue("eventGameBaseUrl", "");
  setValue("eventMainVisualUrl", "");
  setValue("eventStory", "");
  setValue("eventNotes", "");
  setValue("eventTicketValidHours", "0");
  setValue("eventMaxFreeTickets", "1");
  setValue("eventDescription", "");
  syncTicketProviderFields();

  setText("saveEventBtn", "公演を登録");
  addHidden("cancelEditEventBtn");
}

function syncTicketProviderFields() {
  const provider = getValue("eventTicketProvider", "member");
  const escapeFields = $("escapeIdFields");
  const memberFields = $("memberTicketFields");

  escapeFields?.classList.toggle("hidden", provider !== "escape_id");
  memberFields?.classList.toggle("hidden", provider === "escape_id");

  if (provider === "escape_id") {
    setValue("eventType", "paid");
  }
}

function parseEscapeApiUrl() {
  const rawUrl = getValue("eventEscapeApiUrl").trim();

  if (!rawUrl) {
    showMessage("ESCAPE.IDの空き状況API URLを貼り付けてください。", "error");
    return;
  }

  let url;
  try {
    url = new URL(rawUrl);
  } catch (err) {
    showMessage("URLの形式が正しくありません。", "error");
    return;
  }

  if (url.hostname !== "pubapi.escape.id") {
    showMessage("pubapi.escape.id のURLを入力してください。", "error");
    return;
  }

  const match = url.pathname.match(/^\/e\/([a-zA-Z0-9_-]+)\/loc\/([a-zA-Z0-9_-]+)\/slots\.jsonp?$/i);

  if (!match) {
    showMessage("ESCAPE.IDの公演空き状況API URLを読み取れませんでした。", "error");
    return;
  }

  setValue("eventEscapeEventId", match[1]);
  setValue("eventEscapeLocationId", match[2]);
  showMessage("ESCAPE.IDの公演IDと会場IDを読み取りました。");
}

async function generateStamp() {
  try {
    const res = await api("adminGenerateStampCode", {
      token: getAdminToken(),
      eventId: getValue("stampEventId"),
      stampName: getValue("stampName"),
      point: getValue("stampPoint"),
      limitType: getValue("stampLimitType"),
      maxUses: getValue("stampMaxUses"),
    });

    const stampPageUrl = new URL("stamp.html", location.href);
    stampPageUrl.searchParams.set("code", res.stampCode);

    const stampUrl = stampPageUrl.toString();

    removeHidden("generatedStamp");
    setText("generatedStampCode", stampUrl);

    setValue("stampName", "");

    const qrBox = $("qrBox");
    if (qrBox) {
      qrBox.innerHTML = "";

      if (window.QRCode) {
        new QRCode(qrBox, {
          text: stampUrl,
          width: 180,
          height: 180,
        });
      } else {
        qrBox.innerHTML = `
          <p>QR生成ライブラリの読み込みに失敗しました。</p>
          <p>下のURLをコピーして使ってください。</p>
          <p class="code">${escapeHtml(stampUrl)}</p>
        `;
      }
    }

    showMessage("スタンプURLを生成しました。");
    await refreshAdmin();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function loadStampCodes() {
  const stamps = await api("adminListStampCodes", {
    token: getAdminToken(),
  });

  renderStampTable(stamps);
}

function renderStampTable(stamps) {
  const root = $("stampTable");
  if (!root) return;

  if (!stamps.length) {
    root.innerHTML = `<p>スタンプコードはありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>スタンプ名</th>
            <th>対象公演</th>
            <th>コード</th>
            <th>pt</th>
            <th>制限</th>
            <th>使用</th>
            <th>有効</th>
            <th>作成日</th>
          </tr>
        </thead>
        <tbody>
          ${stamps.map((s) => `
            <tr>
              <td>${escapeHtml(s.stampName || s.eventTitle)}</td>
              <td>${escapeHtml(s.eventTitle)}</td>
              <td><span class="code">${escapeHtml(s.stampCode)}</span></td>
              <td>${escapeHtml(s.point)}</td>
              <td>${limitTypeText(s.limitType)}</td>
              <td>${escapeHtml(s.usedCount)} / ${escapeHtml(s.maxUses)}</td>
              <td>${escapeHtml(s.active)}</td>
              <td>${formatDate(s.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function useTicket() {
  try {
    const res = await api("adminUseTicket", {
      token: getAdminToken(),
      ticketCode: getValue("useTicketCode"),
    });

    setValue("useTicketCode", "");

    removeHidden("usedTicketResult");
    setHtml("usedTicketResult", `
      <h3>${res.alreadyUsed ? "すでに使用済みです" : "使用済みにしました"}</h3>
      <p>公演：${escapeHtml(res.ticket.eventTitle || "")}</p>
      <p>会員：${escapeHtml(res.ticket.userName || "")}${res.ticket.userEmail ? " / " + escapeHtml(res.ticket.userEmail) : ""}</p>
      ${res.ticket.ticketCode ? `<p>会員チケット：<span class="code">${escapeHtml(res.ticket.ticketCode)}</span></p>` : ""}
      ${res.ticket.gameUrl ? `<p>ゲームURL：<span class="code">${escapeHtml(res.ticket.gameUrl)}</span></p><p><a href="${escapeAttr(res.ticket.gameUrl)}" target="_blank" rel="noopener">ゲームURLを開く</a></p>` : ""}
      ${res.ticket.gameStatus ? `<p>ゲーム状態：${gameStatusText(res.ticket.gameStatus)}</p>` : ""}
      <p>処理日時：${formatDate(res.ticket.usedAt)}</p>
    `);

    showMessage(res.message || (res.alreadyUsed ? "このチケットはすでに使用済みです。" : "チケットを使用済みにしました。"));
    await refreshAdmin();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function loadTickets() {
  const tickets = await api("adminListTickets", {
    token: getAdminToken(),
  });

  renderTicketsTable(tickets);
}

function renderTicketsTable(tickets) {
  const root = $("ticketsTable");
  if (!root) return;

  if (!tickets.length) {
    root.innerHTML = `<p>チケットはまだありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>会員チケット</th>
            <th>発行元</th>
            <th>会員状態</th>
            <th>ゲーム状態</th>
            <th>公演</th>
            <th>会員</th>
            <th>ゲームURL</th>
            <th>発行日</th>
            <th>使用日</th>
          </tr>
        </thead>
        <tbody>
          ${tickets.map((t) => `
            <tr>
              <td><span class="code">${escapeHtml(t.ticketCode)}</span></td>
              <td>${escapeHtml(t.source === "tickets" ? "外部発行" : "会員サイト")}</td>
              <td>${statusText(t.status)}</td>
              <td>${gameStatusText(t.gameStatus)}${t.gameExpiresAt ? `<br><span class="muted">期限：${formatDate(t.gameExpiresAt)}</span>` : ""}</td>
              <td>${escapeHtml(t.eventTitle)}</td>
              <td>${escapeHtml(t.userName)}<br><span class="muted">${escapeHtml(t.userEmail)}</span></td>
              <td>${t.gameUrl ? `<a href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener">開く</a><br><span class="code">${escapeHtml(t.gameUrl)}</span>` : ""}</td>
              <td>${formatDate(t.createdAt)}</td>
              <td>${formatDate(t.usedAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

async function loadUsers() {
  const users = await api("adminListUsers", {
    token: getAdminToken(),
  });

  renderUsersTable(users);
}

function renderUsersTable(users) {
  const root = $("usersTable");
  if (!root) return;

  if (!users.length) {
    root.innerHTML = `<p>会員はまだいません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>表示名</th>
            <th>メール</th>
            <th>メール認証</th>
            <th>メール希望</th>
            <th>種別</th>
            <th>権限</th>
            <th>チケット</th>
            <th>使用済み</th>
            <th>ポイント</th>
            <th>参加公演</th>
            <th>登録日</th>
          </tr>
        </thead>
        <tbody>
          ${users.map((u) => `
            <tr>
              <td>${escapeHtml(u.name)}</td>
              <td>${escapeHtml(u.email)}</td>
              <td>${u.emailVerified ? "認証済み" : "未認証"}</td>
              <td>${u.campaignOptIn ? "希望する" : "希望しない"}</td>
              <td>${u.accountType === "arg" ? "ARG" : "通常"}</td>
              <td>${escapeHtml(u.role)}</td>
              <td>${escapeHtml(u.ticketsCount)}</td>
              <td>${escapeHtml(u.usedTicketsCount)}</td>
              <td>${escapeHtml(u.totalPoint)}</td>
              <td>${escapeHtml(u.participationsCount)}</td>
              <td>${formatDate(u.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}


/***********************
 * ARG account management
 ***********************/

async function loadArgAccounts() {
  try {
    argAccounts = await api("adminListArgAccounts", { token: getAdminToken() });
    renderArgAccounts();

    if (selectedArgUserId) {
      const stillExists = argAccounts.some((u) => u.userId === selectedArgUserId);
      if (stillExists) openArgEditor(selectedArgUserId);
      else closeArgEditor();
    }
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderArgAccounts() {
  const root = $("argAccountsList");
  if (!root) return;

  if (!argAccounts.length) {
    root.innerHTML = `<p class="muted">ARG用アカウントはまだありません。</p>`;
    return;
  }

  root.innerHTML = `<div class="arg-account-list">${argAccounts.map((u) => `
    <button type="button" class="arg-account-item ${u.userId === selectedArgUserId ? "active" : ""}" data-arg-user="${escapeAttr(u.userId)}">
      <span><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.email)}</small></span>
      <span class="arg-account-meta">URL ${u.links?.length || 0}件 / スタンプ ${u.stamps?.length || 0}件</span>
    </button>
  `).join("")}</div>`;

  root.querySelectorAll("[data-arg-user]").forEach((btn) => {
    btn.addEventListener("click", () => openArgEditor(btn.dataset.argUser));
  });
}

async function createArgAccount() {
  try {
    const name = getValue("argCreateName").trim();
    const email = getValue("argCreateEmail").trim();
    const password = getValue("argCreatePassword");
    const createdLocal = getValue("argCreateCreatedAt");
    const createdAt = createdLocal ? new Date(createdLocal).toISOString() : "";

    const res = await api("adminCreateArgAccount", {
      token: getAdminToken(),
      name,
      email,
      password,
      createdAt,
      emailVerified: !!$("argCreateVerified")?.checked,
    });

    setValue("argCreateName", "");
    setValue("argCreateEmail", "");
    setValue("argCreatePassword", "");
    setValue("argCreateCreatedAt", "");
    if ($("argCreateVerified")) $("argCreateVerified").checked = true;

    selectedArgUserId = res.userId;
    showMessage(res.message || "ARG用アカウントを作成しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function openArgEditor(userId) {
  const user = argAccounts.find((u) => u.userId === userId);
  if (!user) return;

  selectedArgUserId = userId;
  setValue("argEditUserId", user.userId);
  setValue("argEditName", user.name);
  setValue("argEditEmail", user.email);
  setValue("argEditPassword", "");
  setValue("argEditCreatedAt", isoToLocalInput(user.createdAt));
  if ($("argEditVerified")) $("argEditVerified").checked = !!user.emailVerified;
  setText("argEditorTitle", `${user.name} / ARGアカウント編集`);
  removeHidden("argAccountEditor");
  renderArgGameLinks(user.links || []);
  renderArgStamps(user.stamps || []);
  renderArgAccounts();
}

function closeArgEditor() {
  selectedArgUserId = null;
  addHidden("argAccountEditor");
  renderArgAccounts();
}

async function saveArgAccount() {
  if (!selectedArgUserId) return;
  try {
    const createdLocal = getValue("argEditCreatedAt");
    const res = await api("adminUpdateArgAccount", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      name: getValue("argEditName").trim(),
      email: getValue("argEditEmail").trim(),
      newPassword: getValue("argEditPassword"),
      createdAt: createdLocal ? new Date(createdLocal).toISOString() : "",
      emailVerified: !!$("argEditVerified")?.checked,
    });
    setValue("argEditPassword", "");
    showMessage(res.message || "保存しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function deleteArgAccountAdmin() {
  if (!selectedArgUserId) return;
  const user = argAccounts.find((u) => u.userId === selectedArgUserId);
  if (!user) return;
  if (!confirm(`${user.name} のARG用アカウントを削除しますか？\n\n発行したゲームURLとtokenも削除されます。`)) return;
  if (!confirm("この操作は元に戻せません。削除を実行しますか？")) return;

  try {
    const res = await api("adminDeleteArgAccount", {
      token: getAdminToken(),
      userId: selectedArgUserId,
    });
    closeArgEditor();
    showMessage(res.message || "削除しました。");
    await refreshAdmin();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function issueArgGameUrl() {
  if (!selectedArgUserId) return;
  try {
    const res = await api("adminIssueArgGameUrl", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      title: getValue("argGameTitle").trim(),
      gameId: getValue("argGameId").trim(),
      baseUrl: getValue("argGameBaseUrl").trim(),
      validHours: Number(getValue("argGameValidHours", "0")),
      status: getValue("argGameStatus", "unused"),
    });
    setValue("argGameTitle", "");
    setValue("argGameId", "");
    setValue("argGameBaseUrl", "");
    setValue("argGameValidHours", "0");
    setValue("argGameStatus", "unused");
    showMessage(res.message || "ゲームURLを発行しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderArgGameLinks(links) {
  const root = $("argGameLinks");
  if (!root) return;

  if (!links.length) {
    root.innerHTML = `<p class="muted">このアカウントにはゲームURLがありません。</p>`;
    return;
  }

  root.innerHTML = `<div class="arg-game-link-list">${links.map((link) => `
    <article class="arg-game-link-card" data-arg-ticket="${escapeAttr(link.ticketId)}">
      <div class="arg-link-head">
        <strong>${escapeHtml(link.title || "ゲームURL")}</strong>
        <span class="code">${escapeHtml(link.gameToken || "")}</span>
      </div>
      <label>表示名<input data-field="title" value="${escapeAttr(link.title || "")}" /></label>
      <label>gameId<input data-field="gameId" value="${escapeAttr(link.gameId || "")}" /></label>
      <label>ゲーム先URL<input data-field="baseUrl" type="url" value="${escapeAttr(stripTokenFromUrl(link.gameUrl || ""))}" /></label>
      <label>URL有効時間<input data-field="validHours" type="number" min="0" value="${escapeAttr(validHoursInputValue(link.validHours, 0))}" /><small>0 = 無期限</small></label>
      <label>状態
        <select data-field="status">
          ${["unused","active","cleared","expired","blocked"].map((s) => `<option value="${s}" ${link.gameStatus === s ? "selected" : ""}>${s}</option>`).join("")}
        </select>
      </label>
      <p class="muted arg-current-url">現在のURL：<a href="${escapeAttr(link.gameUrl || "#")}" target="_blank" rel="noopener">${escapeHtml(link.gameUrl || "")}</a></p>
      <div class="button-row">
        <button type="button" class="small-btn" data-save-arg-link="${escapeAttr(link.ticketId)}">変更を保存</button>
        <button type="button" class="small-btn ghost" data-copy-arg-link="${escapeAttr(link.gameUrl || "")}">URLをコピー</button>
        <button type="button" class="small-btn danger-btn" data-delete-arg-link="${escapeAttr(link.ticketId)}">削除</button>
      </div>
    </article>
  `).join("")}</div>`;

  root.querySelectorAll("[data-save-arg-link]").forEach((btn) => {
    btn.addEventListener("click", () => saveArgGameLink(btn.dataset.saveArgLink));
  });
  root.querySelectorAll("[data-delete-arg-link]").forEach((btn) => {
    btn.addEventListener("click", () => deleteArgGameLink(btn.dataset.deleteArgLink));
  });
  root.querySelectorAll("[data-copy-arg-link]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copyArgLink || "");
        showMessage("ゲームURLをコピーしました。");
      } catch (e) {
        showMessage("URLをコピーできませんでした。", "error");
      }
    });
  });
}

async function saveArgGameLink(ticketId) {
  if (!selectedArgUserId) return;
  const card = document.querySelector(`[data-arg-ticket="${CSS.escape(ticketId)}"]`);
  if (!card) return;
  const field = (name) => card.querySelector(`[data-field="${name}"]`)?.value || "";

  try {
    const res = await api("adminUpdateArgGameUrl", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      ticketId,
      title: field("title").trim(),
      gameId: field("gameId").trim(),
      baseUrl: field("baseUrl").trim(),
      validHours: Number(field("validHours")),
      status: field("status"),
    });
    showMessage(res.message || "ゲームURL設定を更新しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function deleteArgGameLink(ticketId) {
  if (!selectedArgUserId) return;
  if (!confirm("このゲームURLを削除しますか？tokenも認証シートから削除されます。")) return;

  try {
    const res = await api("adminDeleteArgGameUrl", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      ticketId,
    });
    showMessage(res.message || "削除しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}


async function addArgStamp() {
  if (!selectedArgUserId) return;

  try {
    const createdLocal = getValue("argStampCreatedAt");
    const res = await api("adminAddArgStamp", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      title: getValue("argStampTitle").trim(),
      eventId: getValue("argStampEventId").trim(),
      point: Number(getValue("argStampPoint", "1")),
      createdAt: createdLocal ? new Date(createdLocal).toISOString() : "",
    });

    setValue("argStampTitle", "");
    setValue("argStampEventId", "");
    setValue("argStampPoint", "1");
    setValue("argStampCreatedAt", "");

    showMessage(res.message || "スタンプを表示しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderArgStamps(stamps) {
  const root = $("argStampList");
  if (!root) return;

  if (!stamps.length) {
    root.innerHTML = `<p class="muted">このアカウントに表示中のスタンプはありません。</p>`;
    return;
  }

  root.innerHTML = `<div class="arg-stamp-card-list">${stamps.map((stamp) => `
    <article class="arg-stamp-card" data-arg-stamp="${escapeAttr(stamp.logId)}">
      <div class="arg-link-head">
        <strong>${escapeHtml(stamp.title || "スタンプ")}</strong>
        <span class="code">${escapeHtml(String(stamp.point ?? 0))} pt</span>
      </div>

      <div class="arg-stamp-edit-grid">
        <label>表示名
          <input data-stamp-field="title" value="${escapeAttr(stamp.title || "")}" />
        </label>

        <label>eventId
          <input data-stamp-field="eventId" value="${escapeAttr(stamp.eventId || "")}" />
        </label>

        <label>ポイント
          <input data-stamp-field="point" type="number" min="0" max="999" step="1" value="${escapeAttr(String(stamp.point ?? 0))}" />
        </label>

        <label>取得日時
          <input data-stamp-field="createdAt" type="datetime-local" value="${escapeAttr(isoToLocalInput(stamp.createdAt || ""))}" />
        </label>
      </div>

      <div class="button-row">
        <button type="button" class="small-btn" data-save-arg-stamp="${escapeAttr(stamp.logId)}">変更を保存</button>
        <button type="button" class="small-btn danger-btn" data-delete-arg-stamp="${escapeAttr(stamp.logId)}">削除</button>
      </div>
    </article>
  `).join("")}</div>`;

  root.querySelectorAll("[data-save-arg-stamp]").forEach((btn) => {
    btn.addEventListener("click", () => saveArgStamp(btn.dataset.saveArgStamp));
  });

  root.querySelectorAll("[data-delete-arg-stamp]").forEach((btn) => {
    btn.addEventListener("click", () => deleteArgStamp(btn.dataset.deleteArgStamp));
  });
}

async function saveArgStamp(logId) {
  if (!selectedArgUserId) return;

  const card = document.querySelector(`[data-arg-stamp="${CSS.escape(logId)}"]`);
  if (!card) return;

  const field = (name) => card.querySelector(`[data-stamp-field="${name}"]`)?.value || "";
  const createdLocal = field("createdAt");

  try {
    const res = await api("adminUpdateArgStamp", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      logId,
      title: field("title").trim(),
      eventId: field("eventId").trim(),
      point: Number(field("point")),
      createdAt: createdLocal ? new Date(createdLocal).toISOString() : "",
    });

    showMessage(res.message || "スタンプ表示を更新しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function deleteArgStamp(logId) {
  if (!selectedArgUserId) return;
  if (!confirm("このスタンプをARGアカウントの表示から削除しますか？")) return;

  try {
    const res = await api("adminDeleteArgStamp", {
      token: getAdminToken(),
      userId: selectedArgUserId,
      logId,
    });

    showMessage(res.message || "スタンプ表示を削除しました。");
    await loadArgAccounts();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function stripTokenFromUrl(value) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.searchParams.delete("token");
    return url.toString();
  } catch (e) {
    return value.replace(/([?&])token=[^&]*(&?)/, (m, first, tail) => tail ? first : "").replace(/[?&]$/, "");
  }
}

function isoToLocalInput(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


/***********************
 * Game access paper
 ***********************/

async function loadAccessPapers() {
  try {
    gameAccessPapers = await api("adminListGameAccessPapers", {
      token: getAdminToken(),
    });
    renderAccessPaperHistory();
  } catch (err) {
    const root = $("accessPaperHistory");
    if (root) root.innerHTML = `<p class="muted">取得できませんでした。</p>`;
  }
}

async function issueAccessPapers() {
  try {
    const payload = {
      token: getAdminToken(),
      title: getValue("accessPaperTitle").trim(),
      gameId: getValue("accessPaperGameId").trim(),
      baseUrl: getValue("accessPaperBaseUrl").trim(),
      validHours: Number(getValue("accessPaperValidHours", "0")),
      count: Number(getValue("accessPaperCount", "1")),
      instructions: getValue("accessPaperInstructions").trim(),
      notes: getValue("accessPaperNotes").trim(),
    };

    const button = $("issueAccessPapersBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "発行しています…";
    }

    const res = await api("adminCreateGameAccessPapers", payload);
    lastIssuedAccessPapers = res.papers || [];
    renderIssuedAccessPapers();
    showMessage(res.message || "ゲームアクセス用紙を発行しました。");
    await loadAccessPapers();
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    const button = $("issueAccessPapersBtn");
    if (button) {
      button.disabled = false;
      button.textContent = "URL・QRコードを発行";
    }
  }
}

function renderIssuedAccessPapers() {
  const root = $("accessPaperIssued");
  const printAllBtn = $("printAllAccessPapersBtn");
  if (!root) return;

  if (!lastIssuedAccessPapers.length) {
    root.innerHTML = `<p class="muted">まだ発行していません。</p>`;
    printAllBtn?.classList.add("hidden");
    return;
  }

  printAllBtn?.classList.toggle("hidden", lastIssuedAccessPapers.length < 2);

  root.innerHTML = `<div class="access-issued-list">${lastIssuedAccessPapers.map((paper, index) => `
    <article class="access-issued-card">
      <div>
        <strong>${escapeHtml(paper.title)}</strong>
        <p class="muted">${escapeHtml(validHoursText(paper.validHours, 0))}</p>
        <p class="code access-url-text">${escapeHtml(paper.gameUrl)}</p>
      </div>
      <div class="access-qr-preview" id="accessIssuedQr${index}"></div>
      <div class="button-row">
        <button type="button" class="small-btn" data-print-issued="${index}">印刷画面を開く</button>
        <button type="button" class="small-btn ghost" data-copy-issued="${index}">URLをコピー</button>
      </div>
    </article>
  `).join("")}</div>`;

  lastIssuedAccessPapers.forEach((paper, index) => {
    renderQrInto(`accessIssuedQr${index}`, paper.gameUrl, 170);
  });

  root.querySelectorAll("[data-print-issued]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const paper = lastIssuedAccessPapers[Number(btn.dataset.printIssued)];
      if (paper) printAccessPaper(paper);
    });
  });

  root.querySelectorAll("[data-copy-issued]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const paper = lastIssuedAccessPapers[Number(btn.dataset.copyIssued)];
      if (paper) await copyAccessText(paper.gameUrl);
    });
  });
}

function renderAccessPaperHistory() {
  const root = $("accessPaperHistory");
  if (!root) return;

  if (!gameAccessPapers.length) {
    root.innerHTML = `<p class="muted">発行済みのアクセス用紙はありません。</p>`;
    return;
  }

  root.innerHTML = `<div class="access-history-list">${gameAccessPapers.map((paper) => `
    <article class="access-history-item" data-access-paper="${escapeAttr(paper.paperId)}">
      <div class="access-history-head">
        <div>
          <strong>${escapeHtml(paper.title || "ゲームアクセス用紙")}</strong>
          <small>${escapeHtml(formatDate(paper.createdAt))}</small>
        </div>
        <span class="access-status">${escapeHtml(gameStatusText(paper.status))}</span>
      </div>

      <div class="grid two access-edit-grid">
        <div>
          <label>用紙タイトル<input data-field="title" value="${escapeAttr(paper.title || "")}" /></label>
          <label>gameId<input data-field="gameId" value="${escapeAttr(paper.gameId || "")}" /></label>
          <label>ゲーム先URL<input data-field="baseUrl" type="url" value="${escapeAttr(paper.baseUrl || stripTokenFromUrl(paper.gameUrl || ""))}" /></label>
          <label>URL有効時間<input data-field="validHours" type="number" min="0" value="${escapeAttr(validHoursInputValue(paper.validHours, 24))}" /><small>0 = 無期限</small></label>
          <label>状態
            <select data-field="status">
              ${["unused","active","cleared","expired","blocked"].map((s) => `<option value="${s}" ${paper.status === s ? "selected" : ""}>${escapeHtml(gameStatusText(s))}</option>`).join("")}
            </select>
          </label>
        </div>

        <div>
          <label>ゲームプレイ方法<textarea data-field="instructions">${escapeHtml(paper.instructions || "")}</textarea></label>
          <label>注意事項<textarea data-field="notes">${escapeHtml(paper.notes || "")}</textarea></label>
          <p class="muted">token：<span class="code">${escapeHtml(paper.gameToken || "")}</span></p>
          <p class="muted access-current-url">現在のURL：<a href="${escapeAttr(paper.gameUrl || "#")}" target="_blank" rel="noopener">${escapeHtml(paper.gameUrl || "")}</a></p>
        </div>
      </div>

      <div class="button-row">
        <button type="button" class="small-btn" data-save-access="${escapeAttr(paper.paperId)}">変更を保存</button>
        <button type="button" class="small-btn ghost" data-print-access="${escapeAttr(paper.paperId)}">印刷</button>
        <button type="button" class="small-btn ghost" data-copy-access="${escapeAttr(paper.paperId)}">URLをコピー</button>
        <button type="button" class="small-btn danger-btn" data-delete-access="${escapeAttr(paper.paperId)}">削除</button>
      </div>
    </article>
  `).join("")}</div>`;

  root.querySelectorAll("[data-save-access]").forEach((btn) => {
    btn.addEventListener("click", () => saveAccessPaper(btn.dataset.saveAccess));
  });
  root.querySelectorAll("[data-print-access]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const paper = gameAccessPapers.find((p) => p.paperId === btn.dataset.printAccess);
      if (paper) printAccessPaper(paper);
    });
  });
  root.querySelectorAll("[data-copy-access]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const paper = gameAccessPapers.find((p) => p.paperId === btn.dataset.copyAccess);
      if (paper) await copyAccessText(paper.gameUrl);
    });
  });
  root.querySelectorAll("[data-delete-access]").forEach((btn) => {
    btn.addEventListener("click", () => deleteAccessPaper(btn.dataset.deleteAccess));
  });
}

async function saveAccessPaper(paperId) {
  const card = document.querySelector(`[data-access-paper="${CSS.escape(paperId)}"]`);
  if (!card) return;
  const field = (name) => card.querySelector(`[data-field="${name}"]`)?.value || "";

  try {
    const res = await api("adminUpdateGameAccessPaper", {
      token: getAdminToken(),
      paperId,
      title: field("title").trim(),
      gameId: field("gameId").trim(),
      baseUrl: field("baseUrl").trim(),
      validHours: Number(field("validHours")),
      status: field("status"),
      instructions: field("instructions").trim(),
      notes: field("notes").trim(),
    });
    showMessage(res.message || "アクセス用紙を更新しました。");
    await loadAccessPapers();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

async function deleteAccessPaper(paperId) {
  if (!confirm("このアクセス用紙を削除しますか？\\n対応するゲームtokenも削除され、URLは使えなくなります。")) return;

  try {
    const res = await api("adminDeleteGameAccessPaper", {
      token: getAdminToken(),
      paperId,
    });
    showMessage(res.message || "削除しました。");
    lastIssuedAccessPapers = lastIssuedAccessPapers.filter((p) => p.paperId !== paperId);
    renderIssuedAccessPapers();
    await loadAccessPapers();
    await loadDashboard();
    await loadTickets();
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderQrInto(id, text, size = 170) {
  const root = $(id);
  if (!root) return;
  root.innerHTML = "";

  if (!window.QRCode) {
    root.innerHTML = `<p class="muted">QR生成ライブラリを読み込めませんでした。</p>`;
    return;
  }

  new QRCode(root, {
    text,
    width: size,
    height: size,
  });
}

async function buildQrDataUrl(text, size = 520) {
  if (!window.QRCode) throw new Error("QR生成ライブラリを読み込めませんでした。");

  const holder = document.createElement("div");
  holder.style.position = "fixed";
  holder.style.left = "-10000px";
  holder.style.top = "-10000px";
  document.body.appendChild(holder);

  try {
    new QRCode(holder, {
      text,
      width: size,
      height: size,
    });

    await new Promise((resolve) => setTimeout(resolve, 80));

    const canvas = holder.querySelector("canvas");
    if (canvas) return canvas.toDataURL("image/png");

    const img = holder.querySelector("img");
    if (img?.src) return img.src;

    throw new Error("QRコード画像を生成できませんでした。");
  } finally {
    holder.remove();
  }
}

async function printAccessPaper(paper) {
  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showMessage("印刷画面を開けませんでした。ポップアップを許可してください。", "error");
    return;
  }

  printWindow.document.write("<p style='font-family:sans-serif;padding:24px'>QRコードを準備しています…</p>");

  try {
    const qr = await buildQrDataUrl(paper.gameUrl);
    writeAccessPrintWindow(printWindow, [{ paper, qr }]);
  } catch (err) {
    printWindow.close();
    showMessage(err.message, "error");
  }
}

async function printAllAccessPapers() {
  if (!lastIssuedAccessPapers.length) return;

  const printWindow = window.open("", "_blank");
  if (!printWindow) {
    showMessage("印刷画面を開けませんでした。ポップアップを許可してください。", "error");
    return;
  }

  printWindow.document.write("<p style='font-family:sans-serif;padding:24px'>QRコードを準備しています…</p>");

  try {
    const items = [];
    for (const paper of lastIssuedAccessPapers) {
      items.push({
        paper,
        qr: await buildQrDataUrl(paper.gameUrl),
      });
    }
    writeAccessPrintWindow(printWindow, items);
  } catch (err) {
    printWindow.close();
    showMessage(err.message, "error");
  }
}

function writeAccessPrintWindow(printWindow, items) {
  const pages = items.map(({ paper, qr }) => buildAccessPaperPage(paper, qr)).join("");

  printWindow.document.open();
  printWindow.document.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>RIDDLE STORY | GAME ACCESS SHEET</title>
<style>
  :root{
    --ink:#101926;
    --accent:#2f6fed;
    --accent-soft:#eaf1ff;
    --paper:#ffffff;
    --surface:#f4f6f8;
    --line:#cfd7e3;
    --muted:#5d6978;
  }
  *{box-sizing:border-box}
  html,body{margin:0;padding:0;background:#dfe3e8;color:var(--ink);font-family:"Hiragino Sans","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,system-ui,sans-serif}
  .toolbar{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:center;gap:10px;padding:10px 14px;background:#101926;color:#fff;box-shadow:0 2px 12px #0003}
  .toolbar-note{font-size:12px;opacity:.78;margin-right:8px}
  .toolbar button{appearance:none;border:1px solid #fff;background:#fff;color:#101926;padding:9px 16px;border-radius:8px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
  .toolbar button.secondary{background:transparent;color:#fff}

  /* A5の実寸。paddingを含めて148mm×210mmに固定する */
  .paper{
    position:relative;
    width:148mm;
    height:210mm;
    margin:10mm auto;
    padding:10mm 10mm 8mm;
    overflow:hidden;
    background:var(--paper);
    box-shadow:0 8px 30px #0002;
    page-break-after:always;
    break-after:page;
    isolation:isolate;
  }
  .paper:last-child{page-break-after:auto;break-after:auto}

  .paper::before{
    content:"";
    position:absolute;
    inset:0;
    pointer-events:none;
    z-index:-1;
    background:
      linear-gradient(135deg,transparent 0 12mm,var(--accent-soft) 12mm 12.5mm,transparent 12.5mm) top right/36mm 36mm no-repeat,
      linear-gradient(315deg,transparent 0 12mm,var(--accent-soft) 12mm 12.5mm,transparent 12.5mm) bottom left/36mm 36mm no-repeat;
  }
  .paper::after{
    content:"";
    position:absolute;
    left:0;top:0;width:4mm;height:100%;
    background:var(--ink);
  }

  .topline{display:flex;align-items:center;justify-content:space-between;gap:6mm;margin-bottom:6mm;padding-left:1mm}
  .brand{margin:0;font-family:Georgia,"Times New Roman",serif;font-size:10.5pt;font-weight:700;letter-spacing:.24em;white-space:nowrap}
  .doc-tag{display:flex;align-items:center;gap:2mm;font-size:6.8pt;font-weight:800;letter-spacing:.12em;color:var(--accent)}
  .doc-tag::before{content:"";width:8mm;height:1.2mm;background:var(--accent)}

  .hero{display:grid;grid-template-columns:minmax(0,1fr) 46mm;gap:8mm;align-items:center;padding:0 1mm 7mm;border-bottom:.35mm solid var(--line)}
  .hero-copy{min-width:0}
  .kicker{margin:0 0 2.5mm;font-size:7.2pt;font-weight:900;letter-spacing:.18em;color:var(--accent)}
  .title{margin:0;font-size:22pt;line-height:1.16;font-weight:900;letter-spacing:.01em;overflow-wrap:anywhere}
  .meta-line{display:flex;flex-wrap:wrap;gap:2mm 4mm;margin-top:4mm;color:var(--muted);font-size:7.4pt}
  .meta-chip{display:inline-flex;align-items:center;gap:1.5mm}
  .meta-chip b{color:var(--ink)}

  .qr-frame{position:relative;padding:3.5mm;background:var(--surface);border:.35mm solid var(--line)}
  .qr-frame::before,.qr-frame::after{content:"";position:absolute;width:7mm;height:7mm;border-color:var(--accent);border-style:solid;pointer-events:none}
  .qr-frame::before{left:-.35mm;top:-.35mm;border-width:.8mm 0 0 .8mm}
  .qr-frame::after{right:-.35mm;bottom:-.35mm;border-width:0 .8mm .8mm 0}
  .qr-frame img{display:block;width:38mm;height:38mm;margin:auto;object-fit:contain;image-rendering:pixelated;background:#fff}
  .scan-label{margin:2.4mm 0 0;text-align:center;font-size:6.5pt;font-weight:900;letter-spacing:.13em;color:var(--accent)}

  .flow{display:grid;grid-template-columns:repeat(3,1fr);gap:3mm;margin:6mm 0}
  .flow-step{position:relative;min-height:20mm;padding:3mm 3mm 3mm 10mm;border:.3mm solid var(--line);background:#fff}
  .flow-no{position:absolute;left:3mm;top:3mm;font:700 11pt/1 Georgia,serif;color:var(--accent)}
  .flow-step strong{display:block;font-size:8.2pt;margin-bottom:1.5mm}
  .flow-step span{display:block;color:var(--muted);font-size:6.8pt;line-height:1.45}

  .guide{display:grid;grid-template-columns:1.12fr .88fr;gap:5mm;margin-top:5mm}
  .panel{min-width:0;border-top:1mm solid var(--ink);padding-top:3mm}
  .panel h2{display:flex;align-items:center;gap:2mm;margin:0 0 2.5mm;font-size:9pt;letter-spacing:.08em}
  .panel h2::before{content:"";width:3mm;height:3mm;background:var(--accent);transform:rotate(45deg)}
  .instructions{margin:0;white-space:pre-wrap;font-size:7.7pt;line-height:1.65;color:#273343}
  .notes{margin:0;padding:0;list-style:none;display:grid;gap:1.5mm}
  .notes li{position:relative;padding-left:4mm;font-size:7.1pt;line-height:1.45;color:#273343}
  .notes li::before{content:"";position:absolute;left:.5mm;top:.56em;width:1.5mm;height:1.5mm;background:var(--accent);border-radius:50%}

  .access-box{margin-top:5mm;padding:4mm 5mm;background:var(--ink);color:#fff;display:grid;grid-template-columns:1fr auto;gap:4mm;align-items:center}
  .access-box .label{margin:0 0 1.3mm;font-size:6.4pt;font-weight:800;letter-spacing:.14em;color:#b9c9e9}
  .url{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:6.5pt;line-height:1.35;overflow-wrap:anywhere;word-break:break-all}
  .limit{white-space:nowrap;border-left:.3mm solid #ffffff55;padding-left:4mm;text-align:right}
  .limit b{display:block;font-size:8pt}
  .limit span{display:block;margin-top:1mm;font-size:6.3pt;color:#b9c9e9}

  .footer{position:absolute;left:10mm;right:10mm;bottom:6.5mm;display:flex;align-items:flex-end;justify-content:space-between;gap:5mm;padding-left:1mm;color:var(--muted);font-size:5.8pt;letter-spacing:.04em}
  .footer strong{color:var(--ink);font-weight:900}
  .footer-mark{font-family:Georgia,"Times New Roman",serif;letter-spacing:.18em;font-size:6.2pt;color:var(--ink)}

  @page{size:148mm 210mm;margin:0}
  @media print{
    html,body{width:148mm;margin:0!important;padding:0!important;background:#fff!important}
    body{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .toolbar{display:none!important}
    .paper{width:148mm!important;height:210mm!important;margin:0!important;box-shadow:none!important}
  }
</style>
</head>
<body>
<div class="toolbar">
  <span class="toolbar-note">A5縦・148 × 210 mm</span>
  <button onclick="window.print()">印刷する</button>
  <button class="secondary" onclick="window.close()">閉じる</button>
</div>
${pages}
</body>
</html>`);
  printWindow.document.close();
}

function buildAccessPaperPage(paper, qrDataUrl) {
  const notes = String(paper.notes || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const instructions = paper.instructions ||
    "QRコードを読み取り、表示されたゲームページへアクセスしてください。アクセス後は画面の案内に従ってゲームを開始してください。";

  const hours = Number(paper.validHours);
  const limitMain = hours === 0 ? "期限なし" : `${hours}時間`;
  const limitSub = hours === 0 ? "運営が無効化するまで有効" : "初回アクセスから";
  const gameId = String(paper.gameId || "-");
  const token = String(paper.gameToken || "");
  const accessRef = token ? token.slice(-8).toUpperCase() : String(paper.paperId || "-").slice(-8).toUpperCase();
  const displayNotes = notes.length ? notes : ["この用紙はゲーム終了まで大切に保管してください。"];

  return `
<section class="paper">
  <div class="topline">
    <p class="brand">RIDDLE STORY</p>
    <div class="doc-tag">GAME ACCESS SHEET</div>
  </div>

  <section class="hero">
    <div class="hero-copy">
      <p class="kicker">YOUR ENTRY POINT</p>
      <h1 class="title">${escapeHtml(paper.title || "ゲームアクセス")}</h1>
      <div class="meta-line">
        <span class="meta-chip">GAME <b>${escapeHtml(gameId)}</b></span>
        <span class="meta-chip">ACCESS REF <b>${escapeHtml(accessRef)}</b></span>
      </div>
    </div>
    <div class="qr-frame">
      <img src="${escapeAttr(qrDataUrl)}" alt="ゲームアクセスQRコード">
      <p class="scan-label">SCAN TO START</p>
    </div>
  </section>

  <section class="flow" aria-label="ゲーム開始までの流れ">
    <div class="flow-step"><span class="flow-no">01</span><strong>QRを読み取る</strong><span>スマートフォンやタブレットのカメラで読み取ります。</span></div>
    <div class="flow-step"><span class="flow-no">02</span><strong>ページを開く</strong><span>表示されたゲーム専用ページへアクセスします。</span></div>
    <div class="flow-step"><span class="flow-no">03</span><strong>ゲーム開始</strong><span>画面に表示される案内に従ってプレイしてください。</span></div>
  </section>

  <section class="guide">
    <div class="panel">
      <h2>PLAY GUIDE</h2>
      <p class="instructions">${escapeHtml(instructions)}</p>
    </div>
    <div class="panel">
      <h2>BEFORE YOU START</h2>
      <ul class="notes">
        ${displayNotes.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}
      </ul>
    </div>
  </section>

  <section class="access-box">
    <div>
      <p class="label">DIRECT ACCESS URL</p>
      <p class="url">${escapeHtml(paper.gameUrl || "")}</p>
    </div>
    <div class="limit">
      <b>${escapeHtml(limitMain)}</b>
      <span>${escapeHtml(limitSub)}</span>
    </div>
  </section>

  <footer class="footer">
    <span>この用紙に記載されたURL・QRコードは、発行されたゲームアクセス専用です。</span>
    <span class="footer-mark">RIDDLE STORY</span>
  </footer>
</section>`;
}

async function copyAccessText(text) {
  try {
    await navigator.clipboard.writeText(text || "");
    showMessage("URLをコピーしました。");
  } catch (err) {
    showMessage("URLをコピーできませんでした。", "error");
  }
}

function validHoursInputValue(value, fallback = 24) {
  if (value === 0 || String(value).trim() === "0") return "0";
  const num = Number(value);
  if (Number.isInteger(num) && num >= 1) return String(num);
  return String(fallback);
}

function validHoursText(value, fallback = 24) {
  const normalized = validHoursInputValue(value, fallback);
  return normalized === "0" ? "無期限" : `${normalized}時間`;
}

/***********************
 * Campaign mail
 ***********************/

async function loadCampaignSubscribers() {
  try {
    const users = await api("adminListCampaignSubscribers", {
      token: getAdminToken(),
    });

    setText("mailSubscriberCount", users.length + "人");

    const root = $("campaignSubscribersTable");
    if (!root) return;

    if (!users.length) {
      root.innerHTML = `<p class="muted">送信対象者はいません。</p>`;
      return;
    }

    root.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>表示名</th>
              <th>メール</th>
              <th>認証日時</th>
              <th>希望日時</th>
            </tr>
          </thead>
          <tbody>
            ${users.map((u) => `
              <tr>
                <td>${escapeHtml(u.name)}</td>
                <td>${escapeHtml(u.email)}</td>
                <td>${formatDate(u.emailVerifiedAt)}</td>
                <td>${formatDate(u.campaignOptInAt || u.createdAt)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    setText("mailSubscriberCount", "取得できませんでした");
    const root = $("campaignSubscribersTable");
    if (root) {
      root.innerHTML = `<p class="muted">送信対象者を取得できませんでした。</p>`;
    }
  }
}

async function loadCampaignMailQuota() {
  try {
    const res = await api("adminGetCampaignMailQuota", {
      token: getAdminToken(),
    });
    setText("mailQuotaCount", (res.remainingDailyQuota ?? 0) + "人");
  } catch (err) {
    setText("mailQuotaCount", "取得できませんでした");
  }
}

function readCampaignMailState() {
  try {
    return JSON.parse(localStorage.getItem(CAMPAIGN_MAIL_STATE_KEY) || "null");
  } catch (err) {
    return null;
  }
}

function writeCampaignMailState(state) {
  if (!state) {
    localStorage.removeItem(CAMPAIGN_MAIL_STATE_KEY);
    return;
  }
  localStorage.setItem(CAMPAIGN_MAIL_STATE_KEY, JSON.stringify(state));
}

function newCampaignId() {
  if (window.crypto && crypto.randomUUID) {
    return "campaign_" + crypto.randomUUID();
  }
  return "campaign_" + Date.now() + "_" + Math.random().toString(36).slice(2);
}

function getOrCreateCampaignMailState(subject, body) {
  const current = readCampaignMailState();

  if (current && current.campaignId && current.subject === subject && current.body === body && !current.completed) {
    return current;
  }

  const state = {
    campaignId: newCampaignId(),
    subject: subject,
    body: body,
    completed: false,
    remainingCount: null,
  };
  writeCampaignMailState(state);
  return state;
}

function syncCampaignMailProgress() {
  const state = readCampaignMailState();
  const progress = $("campaignMailProgress");
  const button = $("sendCampaignMailBtn");

  if (!progress || !button) return;

  if (state && !state.completed && Number.isFinite(Number(state.remainingCount)) && Number(state.remainingCount) > 0) {
    progress.textContent = `配信途中：残り ${Number(state.remainingCount)}人`;
    button.textContent = "続きから送信する";
  } else {
    progress.textContent = "新しい配信を開始できます。";
    button.textContent = "希望者に送信する";
  }
}

function getCampaignMailPayload(testMode) {
  const subject = getValue("campaignSubject");
  const body = getValue("campaignBody");
  const payload = {
    token: getAdminToken(),
    subject: subject,
    body: body,
    testMode: !!testMode,
    testEmail: getValue("campaignTestEmail"),
  };

  if (!testMode) {
    payload.campaignId = getOrCreateCampaignMailState(subject, body).campaignId;
  }

  return payload;
}

async function sendCampaignTest() {
  try {
    const payload = getCampaignMailPayload(true);

    if (!payload.testEmail) {
      showMessage("テスト送信先メールアドレスを入力してください。", "error");
      return;
    }

    if (!payload.subject || !payload.body) {
      showMessage("件名と本文を入力してください。", "error");
      return;
    }

    setDisabled("sendCampaignTestBtn", true);

    const res = await api("adminSendCampaignMail", payload);
    showMessage(res.message || "テストメールを送信しました。");
    await loadCampaignMailQuota();
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setDisabled("sendCampaignTestBtn", false);
  }
}

async function sendCampaignMail() {
  try {
    const subject = getValue("campaignSubject");
    const body = getValue("campaignBody");

    if (!subject || !body) {
      showMessage("件名と本文を入力してください。", "error");
      return;
    }

    const current = readCampaignMailState();
    if (current && !current.completed && current.campaignId &&
        (current.subject !== subject || current.body !== body) &&
        Number(current.remainingCount || 0) > 0) {
      const startNew = confirm(
        "前回のメール配信がまだ途中です。\n\n" +
        `残り：${current.remainingCount}人\n\n` +
        "件名または本文が変更されています。新しい配信として開始すると、前回すでに送信した会員にも新しいメールが送られます。\n\n新しい配信を開始しますか？"
      );
      if (!startNew) return;
      writeCampaignMailState(null);
    }

    const payload = getCampaignMailPayload(false);
    const state = readCampaignMailState();
    const isResume = state && Number(state.remainingCount || 0) > 0;

    const ok = confirm(
      (isResume
        ? `前回の続きから、未送信の残り${state.remainingCount}人へ配信します。`
        : "メール配信希望者へ送信します。") +
      "\n\nその日のApps Scriptの残り送信可能数まで自動で送信します。" +
      "\n\n本送信前にテスト送信は確認しましたか？\n\nこの操作は取り消せません。"
    );

    if (!ok) return;

    setDisabled("sendCampaignMailBtn", true);
    setDisabled("sendCampaignTestBtn", true);

    const res = await api("adminSendCampaignMail", payload);

    if (res.completed) {
      writeCampaignMailState(null);
      setText("campaignMailProgress", `配信完了：${res.targetCount}人`);
    } else {
      writeCampaignMailState({
        campaignId: res.campaignId || payload.campaignId,
        subject: subject,
        body: body,
        completed: false,
        remainingCount: Number(res.remainingCount || 0),
      });
      setText("campaignMailProgress", `配信途中：残り ${res.remainingCount}人`);
    }

    if (res.error) {
      showMessage((res.message || "メールを送信しました。") + " 一部エラーがあります: " + res.error, "error");
    } else {
      showMessage(res.message || "メールを送信しました。");
    }

    setText("mailQuotaCount", (res.quotaAfter ?? 0) + "人");
    syncCampaignMailProgress();
    await loadDashboard();
    await loadCampaignSubscribers();
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setDisabled("sendCampaignMailBtn", false);
    setDisabled("sendCampaignTestBtn", false);
  }
}

/***********************
 * UI
 ***********************/

function switchAdminTab(tab) {
  const providerSelect = $("eventTicketProvider");
  if (providerSelect) {
    providerSelect.addEventListener("change", syncTicketProviderFields);
  }
  syncTicketProviderFields();

  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });

  removeHidden("admin-tab-" + tab);
}

function showAdminLogin() {
  removeHidden("adminLoginSection");
  addHidden("adminMainSection");
  addHidden("adminLogoutBtn");
}

function showAdminMain() {
  addHidden("adminLoginSection");
  removeHidden("adminMainSection");
  removeHidden("adminLogoutBtn");
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
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

  return map[status] || status || "";
}

function statusText(status) {
  const map = {
    issued: "未使用",
    used: "使用済み",
    cancelled: "キャンセル済み",
  };

  return map[status] || status || "";
}

function limitTypeText(type) {
  const map = {
    once_per_account: "1アカウント1回",
    once_total: "誰か1人で無効",
    multi: "指定回数まで",
  };

  return map[type] || type || "";
}

function showMessage(text, type = "ok") {
  const el = $("adminMessage");

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

  if (Number.isNaN(d.getTime())) return value;

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
