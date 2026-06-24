// GASのWebアプリURLに変更してください
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const ADMIN_TOKEN_KEY = "rs_admin_token";

const $ = (id) => document.getElementById(id);

let adminEvents = [];
let editingEventId = null;

document.addEventListener("DOMContentLoaded", initAdmin);

async function initAdmin() {
  $("adminLoginBtn").addEventListener("click", adminLogin);
  $("adminLogoutBtn").addEventListener("click", adminLogout);
  $("saveEventBtn").addEventListener("click", saveEvent);
  $("cancelEditEventBtn").addEventListener("click", cancelEventEdit);
  $("generateStampBtn").addEventListener("click", generateStamp);
  $("useTicketBtn").addEventListener("click", useTicket);

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
      password: $("adminPassword").value,
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
}

async function loadDashboard() {
  const data = await api("adminDashboard", {
    token: getAdminToken(),
  });

  $("stats").innerHTML = `
    <div class="stat"><span>会員</span><strong>${data.users}</strong></div>
    <div class="stat"><span>公演</span><strong>${data.events}</strong></div>
    <div class="stat"><span>会員チケット</span><strong>${data.tickets}</strong></div>
    <div class="stat"><span>ゲームtoken</span><strong>${data.gameTickets}</strong></div>
    <div class="stat"><span>有料認証</span><strong>${data.paidAccess}</strong></div>
    <div class="stat"><span>スタンプコード</span><strong>${data.stampCodes}</strong></div>
    <div class="stat"><span>スタンプ取得</span><strong>${data.stampLogs}</strong></div>
  `;
}

async function loadEvents() {
  adminEvents = await api("adminListEvents", {
    token: getAdminToken(),
  });

  renderEventsTable(adminEvents);
  renderEventSelect(adminEvents);
}

function renderEventSelect(events) {
  const select = $("stampEventId");

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

  if (!events.length) {
    root.innerHTML = `<p>登録済み公演はありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>操作</th>
            <th>チケットページ</th>
            <th>公演ID</th>
            <th>公演名</th>
            <th>種別</th>
            <th>状態</th>
            <th>gameId</th>
            <th>ゲーム公開URL</th>
            <th>ショップ</th>
            <th>有料コード</th>
            <th>プレイURL</th>
            <th>無料上限</th>
          </tr>
        </thead>
        <tbody>
          ${events.map((e) => `
            <tr>
              <td><button class="small-btn" type="button" data-edit-event="${escapeAttr(e.eventId)}">編集</button></td>
              <td><a href="ticket-event.html?eventId=${encodeURIComponent(e.eventId)}" target="_blank" rel="noopener">開く</a></td>
              <td><span class="code">${escapeHtml(e.eventId)}</span></td>
              <td>${escapeHtml(e.title)}</td>
              <td>${escapeHtml(e.type)}</td>
              <td>${escapeHtml(e.status)}</td>
              <td>${escapeHtml(e.gameId || "")}</td>
              <td>${e.gameBaseUrl ? `<a href="${escapeAttr(e.gameBaseUrl)}" target="_blank" rel="noopener">開く</a>` : ""}</td>
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
    btn.addEventListener("click", () => {
      startEventEdit(btn.dataset.editEvent);
    });
  });
}

function startEventEdit(eventId) {
  const event = adminEvents.find((e) => e.eventId === eventId);

  if (!event) return;

  editingEventId = eventId;

  $("eventFormTitle").textContent = "公演編集";
  $("eventId").value = event.eventId;
  $("eventId").disabled = true;
  $("eventTitle").value = event.title || "";
  $("eventType").value = event.type || "free";
  $("eventStatus").value = event.status || "public";
  $("eventShopUrl").value = event.shopUrl || "";
  $("eventPaidCode").value = event.paidCode || "";
  $("eventPlayUrl").value = event.playUrl || "";
  $("eventGameId").value = event.gameId || "";
  $("eventGameBaseUrl").value = event.gameBaseUrl || "";
  $("eventMainVisualUrl").value = event.mainVisualUrl || "";
  $("eventStory").value = event.story || "";
  $("eventNotes").value = event.notes || "";
  $("eventMaxFreeTickets").value = event.maxFreeTickets || "1";
  $("eventDescription").value = event.description || "";

  $("saveEventBtn").textContent = "公演を更新";
  $("cancelEditEventBtn").classList.remove("hidden");

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
      eventId: $("eventId").value,
      title: $("eventTitle").value,
      type: $("eventType").value,
      status: $("eventStatus").value,
      shopUrl: $("eventShopUrl").value,
      paidCode: $("eventPaidCode").value,
      playUrl: $("eventPlayUrl").value,
      gameId: $("eventGameId").value,
      gameBaseUrl: $("eventGameBaseUrl").value,
      mainVisualUrl: $("eventMainVisualUrl").value,
      story: $("eventStory").value,
      notes: $("eventNotes").value,
      maxFreeTickets: $("eventMaxFreeTickets").value,
      description: $("eventDescription").value,
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

  $("eventFormTitle").textContent = "公演登録";
  $("eventId").value = "";
  $("eventId").disabled = false;
  $("eventTitle").value = "";
  $("eventType").value = "free";
  $("eventStatus").value = "public";
  $("eventShopUrl").value = "";
  $("eventPaidCode").value = "";
  $("eventPlayUrl").value = "";
  $("eventGameId").value = "";
  $("eventGameBaseUrl").value = "";
  $("eventMainVisualUrl").value = "";
  $("eventStory").value = "";
  $("eventNotes").value = "";
  $("eventMaxFreeTickets").value = "1";
  $("eventDescription").value = "";

  $("saveEventBtn").textContent = "公演を登録";
  $("cancelEditEventBtn").classList.add("hidden");
}

async function generateStamp() {
  try {
    const res = await api("adminGenerateStampCode", {
      token: getAdminToken(),
      eventId: $("stampEventId").value,
      point: $("stampPoint").value,
      limitType: $("stampLimitType").value,
      maxUses: $("stampMaxUses").value,
    });

    $("generatedStamp").classList.remove("hidden");
    $("generatedStampCode").textContent = res.stampCode;

    const qrBox = $("qrBox");
    qrBox.innerHTML = "";

    if (window.QRCode) {
      new QRCode(qrBox, {
        text: res.stampCode,
        width: 180,
        height: 180,
      });
    } else {
      qrBox.textContent = "QR生成ライブラリの読み込みに失敗しました。コードを手動で使ってください。";
    }

    showMessage("スタンプコードを生成しました。");
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

  if (!stamps.length) {
    root.innerHTML = `<p>スタンプコードはありません。</p>`;
    return;
  }

  root.innerHTML = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>公演</th>
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
      ticketCode: $("useTicketCode").value,
    });

    $("useTicketCode").value = "";

    $("usedTicketResult").classList.remove("hidden");
    $("usedTicketResult").innerHTML = `
      <h3>${res.alreadyUsed ? "すでに使用済みです" : "使用済みにしました"}</h3>
      <p>公演：${escapeHtml(res.ticket.eventTitle)}</p>
      <p>会員：${escapeHtml(res.ticket.userName)} / ${escapeHtml(res.ticket.userEmail)}</p>
      <p>会員チケット：<span class="code">${escapeHtml(res.ticket.ticketCode)}</span></p>
      <p>ゲームtoken：<span class="code">${escapeHtml(res.ticket.gameToken || "")}</span></p>
      ${res.ticket.gameUrl ? `<p><a href="${escapeAttr(res.ticket.gameUrl)}" target="_blank" rel="noopener">ゲームURLを開く</a></p>` : ""}
      <p>使用日時：${formatDate(res.ticket.usedAt)}</p>
    `;

    showMessage(res.alreadyUsed ? "このチケットはすでに使用済みです。" : "チケットを使用済みにしました。");
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
            <th>ゲームtoken</th>
            <th>状態</th>
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
              <td><span class="code">${escapeHtml(t.gameToken || "")}</span></td>
              <td>${statusText(t.status)}</td>
              <td>${escapeHtml(t.eventTitle)}</td>
              <td>${escapeHtml(t.userName)}<br><span class="muted">${escapeHtml(t.userEmail)}</span></td>
              <td>${t.gameUrl ? `<a href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener">開く</a>` : ""}</td>
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

function switchAdminTab(tab) {
  document.querySelectorAll(".admin-tab").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });

  document.querySelectorAll(".admin-panel").forEach((panel) => {
    panel.classList.add("hidden");
  });

  $("admin-tab-" + tab).classList.remove("hidden");
}

function showAdminLogin() {
  $("adminLoginSection").classList.remove("hidden");
  $("adminMainSection").classList.add("hidden");
  $("adminLogoutBtn").classList.add("hidden");
}

function showAdminMain() {
  $("adminLoginSection").classList.add("hidden");
  $("adminMainSection").classList.remove("hidden");
  $("adminLogoutBtn").classList.remove("hidden");
}

function getAdminToken() {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

function statusText(status) {
  const map = {
    issued: "未使用",
    used: "使用済み",
    cancelled: "キャンセル済み",
  };

  return map[status] || status;
}

function limitTypeText(type) {
  const map = {
    once_per_account: "1アカウント1回",
    once_total: "誰か1人で無効",
    multi: "指定回数まで",
  };

  return map[type] || type;
}

function showMessage(text, type = "ok") {
  const el = $("adminMessage");
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
