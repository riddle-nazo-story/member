// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbx68_hw9Zon-CVBIvyrGGnlL2uDGBKJOGkNvXtFx1bBtI1CcrAM2K1nHyn3-Xvq7UAczA/exec";

const ADMIN_TOKEN_KEY = "rs_admin_token";

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
  await loadCampaignSubscribers();
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
              <td>${escapeHtml(e.ticketValidHours || "24")}時間</td>
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
  setValue("eventTicketValidHours", event.ticketValidHours || "24");
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
  setValue("eventTicketValidHours", "24");
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

function getCampaignMailPayload(testMode) {
  return {
    token: getAdminToken(),
    subject: getValue("campaignSubject"),
    body: getValue("campaignBody"),
    testMode: !!testMode,
    testEmail: getValue("campaignTestEmail"),
  };
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

    await api("adminSendCampaignMail", payload);

    showMessage("テストメールを送信しました。");
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    setDisabled("sendCampaignTestBtn", false);
  }
}

async function sendCampaignMail() {
  try {
    const payload = getCampaignMailPayload(false);

    if (!payload.subject || !payload.body) {
      showMessage("件名と本文を入力してください。", "error");
      return;
    }

    const ok = confirm(
      "メール配信希望者全員に送信します。\n\n" +
      "本送信前にテスト送信は確認しましたか？\n\n" +
      "この操作は取り消せません。"
    );

    if (!ok) return;

    setDisabled("sendCampaignMailBtn", true);
    setDisabled("sendCampaignTestBtn", true);

    const res = await api("adminSendCampaignMail", payload);

    if (res.error) {
      showMessage((res.message || "メールを送信しました。") + " 一部エラーがあります: " + res.error, "error");
    } else {
      showMessage(res.message || "メールを送信しました。");
    }

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
