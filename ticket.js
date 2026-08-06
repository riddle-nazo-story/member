// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const ESCAPE_ID_API_ORIGIN = "https://pubapi.escape.id";
const $ = (id) => document.getElementById(id);

let currentUser = null;
const escapeCalendarStates = new Map();
const escapeApiCache = new Map();
let escapeJsonpQueue = Promise.resolve();

document.addEventListener("DOMContentLoaded", init);

async function init() {
  if ($("logoutBtn")) {
    $("logoutBtn").addEventListener("click", logout);
  }

  if (window.RSLoader) {
    RSLoader.show({
      label: "SEARCHING THE ARCHIVE",
      title: "公開された物語を探索しています",
      text: "ログイン状態を確認しています……",
    });
  }

  const token = getToken();

  try {
    if (!token) {
      showAuthNotice();
    } else {
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

    if (window.RSLoader) {
      RSLoader.update({
        label: "SEARCHING THE ARCHIVE",
        title: "公開された物語を探索しています",
        text: "スプレッドシートから公演一覧を読み込んでいます……",
      });
    }

    await loadEvents();
  } finally {
    if (window.RSLoader) {
      RSLoader.hide();
    }
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

  root.innerHTML = events.map((event) => {
    const escapeLinked = isEscapeIdEvent(event);
    const panelId = makeEscapePanelId(event.eventId);

    return `
      <article class="card event-card ${escapeLinked ? "is-escape-id" : ""}" id="event-${escapeAttr(event.eventId)}">
        <div class="event-thumb-wrap">
          ${
            event.mainVisualUrl
              ? `<img class="event-thumb" src="${escapeAttr(event.mainVisualUrl)}" alt="${escapeAttr(event.title)}" loading="lazy" />`
              : `<div class="event-thumb no-thumb">NO IMAGE</div>`
          }
        </div>

        <div class="event-info">
          <div class="event-badge-row">
            ${escapeLinked
              ? `<span class="badge escape-id-badge">ESCAPE.ID</span>`
              : `<span class="badge ${event.type === "free" ? "free" : "paid"}">${event.type === "free" ? "無料" : "有料"}</span>`
            }
          </div>

          <h3>${escapeHtml(event.title)}</h3>
          <p class="muted">${escapeHtml(event.description || "")}</p>

          ${escapeLinked
            ? `
              <button
                class="game-link escape-calendar-toggle"
                type="button"
                data-escape-event="${escapeAttr(event.eventId)}"
                aria-controls="${escapeAttr(panelId)}"
                aria-expanded="false"
              >
                日程・チケットを見る
              </button>
              <div id="${escapeAttr(panelId)}" class="escape-id-panel hidden" aria-live="polite"></div>
            `
            : `
              <a class="game-link" href="ticket-event.html?eventId=${encodeURIComponent(event.eventId)}">
                チケットページへ
              </a>
            `
          }
        </div>
      </article>
    `;
  }).join("");

  root.querySelectorAll("[data-escape-event]").forEach((button) => {
    button.addEventListener("click", () => {
      const event = events.find((item) => item.eventId === button.dataset.escapeEvent);
      if (event) toggleEscapeCalendar(event, button);
    });
  });
}

function isEscapeIdEvent(event) {
  return String(event.ticketProvider || "member") === "escape_id";
}

function makeEscapePanelId(eventId) {
  return `escape-panel-${String(eventId || "event").replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}

async function toggleEscapeCalendar(event, button) {
  const panel = $(makeEscapePanelId(event.eventId));
  if (!panel) return;

  const opening = panel.classList.contains("hidden");
  panel.classList.toggle("hidden", !opening);
  button.setAttribute("aria-expanded", opening ? "true" : "false");
  button.textContent = opening ? "日程を閉じる" : "日程・チケットを見る";

  if (!opening) return;

  if (escapeCalendarStates.has(event.eventId)) {
    renderEscapeCalendar(panel, escapeCalendarStates.get(event.eventId));
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }

  panel.innerHTML = `
    <div class="escape-id-loading">
      <span class="escape-id-spinner" aria-hidden="true"></span>
      ESCAPE.IDから空き状況を取得しています……
    </div>
  `;

  try {
    const data = await loadEscapeIdSlots(event);
    const state = createEscapeCalendarState(event, data);
    escapeCalendarStates.set(event.eventId, state);
    renderEscapeCalendar(panel, state);
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  } catch (err) {
    panel.innerHTML = renderEscapeLoadError(event, err.message);
  }
}

function loadEscapeIdSlots(event) {
  const eventId = validateEscapeIdPart(event.escapeEventId, "ESCAPE.IDの公演ID");
  const locationId = validateEscapeIdPart(event.escapeLocationId, "ESCAPE.IDの会場ID");
  const cacheKey = `${eventId}/${locationId}`;

  if (escapeApiCache.has(cacheKey)) {
    return Promise.resolve(escapeApiCache.get(cacheKey));
  }

  const request = escapeJsonpQueue
    .catch(() => undefined)
    .then(() => requestEscapeIdJsonp(eventId, locationId))
    .then((data) => {
      escapeApiCache.set(cacheKey, data);
      return data;
    });

  escapeJsonpQueue = request;
  return request;
}

function requestEscapeIdJsonp(eventId, locationId) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const previousCallback = window.escapeIdSlotsCallback;
    let finished = false;

    const cleanup = () => {
      script.remove();
      window.escapeIdSlotsCallback = previousCallback;
    };

    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("空き状況の取得がタイムアウトしました。"));
    }, 15000);

    window.escapeIdSlotsCallback = (data) => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      cleanup();

      if (!data || !Array.isArray(data.dates)) {
        reject(new Error("ESCAPE.IDから受け取ったデータ形式が正しくありません。"));
        return;
      }

      resolve(data);
    };

    script.async = true;
    script.src = `${ESCAPE_ID_API_ORIGIN}/e/${encodeURIComponent(eventId)}/loc/${encodeURIComponent(locationId)}/slots.jsonp?_=${Date.now()}`;
    script.onerror = () => {
      if (finished) return;
      finished = true;
      window.clearTimeout(timer);
      cleanup();
      reject(new Error("ESCAPE.IDの空き状況を取得できませんでした。"));
    };

    document.head.appendChild(script);
  });
}

function validateEscapeIdPart(value, label) {
  const text = String(value || "").trim();

  if (!text) {
    throw new Error(`${label}が登録されていません。`);
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(text)) {
    throw new Error(`${label}の形式が正しくありません。`);
  }

  return text;
}

function createEscapeCalendarState(event, data) {
  const dates = (Array.isArray(data.dates) ? data.dates : [])
    .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const datesByDate = new Map(dates.map((item) => [item.date, item]));
  const today = toYmd(new Date());
  const initialItem = dates.find((item) => item.date >= today) || dates[0] || null;
  const initialDate = initialItem ? parseYmd(initialItem.date) : new Date();

  return {
    event,
    data,
    dates,
    datesByDate,
    currentYear: initialDate.getFullYear(),
    currentMonth: initialDate.getMonth(),
    selectedDate: initialItem ? initialItem.date : "",
  };
}

function renderEscapeCalendar(panel, state) {
  if (!state.dates.length) {
    panel.innerHTML = `
      <div class="escape-id-empty">
        <strong>現在、公開されている日程はありません。</strong>
        ${renderEscapePurchaseLink(state.event, "ESCAPE.IDのページを確認する")}
      </div>
    `;
    return;
  }

  const selected = state.datesByDate.get(state.selectedDate) || null;
  const monthLabel = `${state.currentYear}年${state.currentMonth + 1}月`;

  panel.innerHTML = `
    <section class="escape-id-calendar" aria-label="${escapeAttr(state.event.title)}の公演カレンダー">
      <div class="escape-id-calendar-head">
        <div>
          <p class="escape-id-kicker">ESCAPE.ID LIVE AVAILABILITY</p>
          <h4>${escapeHtml(monthLabel)}</h4>
        </div>
        <div class="escape-id-month-actions">
          <button type="button" class="ghost" data-calendar-prev aria-label="前の月">‹</button>
          <button type="button" class="ghost" data-calendar-next aria-label="次の月">›</button>
        </div>
      </div>

      <div class="escape-id-weekdays" aria-hidden="true">
        <span>日</span><span>月</span><span>火</span><span>水</span><span>木</span><span>金</span><span>土</span>
      </div>

      <div class="escape-id-days">
        ${renderEscapeMonthDays(state)}
      </div>

      <div class="escape-id-legend" aria-label="空き状況の見方">
        <span><b>○</b> 空きあり</span>
        <span><b>△</b> 残りわずか</span>
        <span><b>×</b> 完売</span>
        <span><b>―</b> 受付外</span>
      </div>

      <div class="escape-id-slots">
        ${renderEscapeSlots(state.event, selected)}
      </div>

      <div class="escape-id-source">
        <span>空き状況更新：${escapeHtml(state.data.generatedAt || "不明")}</span>
        ${renderEscapePurchaseLink(state.event, "ESCAPE.IDのチケットページを開く")}
      </div>
    </section>
  `;

  panel.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    moveEscapeMonth(state, -1);
    renderEscapeCalendar(panel, state);
  });

  panel.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    moveEscapeMonth(state, 1);
    renderEscapeCalendar(panel, state);
  });

  panel.querySelectorAll("[data-escape-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.escapeDate;
      renderEscapeCalendar(panel, state);
    });
  });
}

function renderEscapeMonthDays(state) {
  const first = new Date(state.currentYear, state.currentMonth, 1);
  const last = new Date(state.currentYear, state.currentMonth + 1, 0);
  const cells = [];

  for (let i = 0; i < first.getDay(); i += 1) {
    cells.push(`<span class="escape-id-day is-blank" aria-hidden="true"></span>`);
  }

  for (let day = 1; day <= last.getDate(); day += 1) {
    const date = new Date(state.currentYear, state.currentMonth, day);
    const ymd = toYmd(date);
    const item = state.datesByDate.get(ymd);
    const status = item ? normalizeVacancyType(item.vacancyType) : "NONE";
    const selectable = Boolean(item);
    const selected = state.selectedDate === ymd;

    cells.push(`
      <button
        type="button"
        class="escape-id-day ${vacancyClass(status)} ${selected ? "is-selected" : ""}"
        ${selectable ? `data-escape-date="${escapeAttr(ymd)}"` : "disabled"}
        aria-label="${escapeAttr(`${state.currentMonth + 1}月${day}日 ${vacancyText(status)}`)}"
      >
        <span class="escape-id-day-number">${day}</span>
        <span class="escape-id-day-mark">${vacancyMark(status)}</span>
      </button>
    `);
  }

  return cells.join("");
}

function renderEscapeSlots(event, dateItem) {
  if (!dateItem) {
    return `<p class="muted">カレンダーから公演日を選択してください。</p>`;
  }

  const slots = Array.isArray(dateItem.slots) ? dateItem.slots : [];
  const dateLabel = formatJapaneseDate(dateItem.date);

  if (!slots.length) {
    return `
      <div class="escape-id-slot-heading">
        <strong>${escapeHtml(dateLabel)}</strong>
        <span class="escape-id-vacancy ${vacancyClass(dateItem.vacancyType)}">${escapeHtml(vacancyText(dateItem.vacancyType))}</span>
      </div>
      <p class="muted">この日の時間情報はありません。</p>
    `;
  }

  return `
    <div class="escape-id-slot-heading">
      <strong>${escapeHtml(dateLabel)}</strong>
      <span class="escape-id-vacancy ${vacancyClass(dateItem.vacancyType)}">${escapeHtml(vacancyText(dateItem.vacancyType))}</span>
    </div>
    <div class="escape-id-slot-list">
      ${slots.map((slot) => renderEscapeSlot(event, slot)).join("")}
    </div>
  `;
}

function renderEscapeSlot(event, slot) {
  const status = normalizeVacancyType(slot.vacancyType);
  const available = status === "MANY" || status === "FEW";
  const time = `${extractTime(slot.startAt)}〜${extractTime(slot.endAt)}`;
  const purchaseUrl = safePurchaseUrl(event.escapePurchaseUrl);

  if (available && purchaseUrl) {
    return `
      <a class="escape-id-slot ${vacancyClass(status)}" href="${escapeAttr(purchaseUrl)}" target="_blank" rel="noopener noreferrer">
        <span class="escape-id-slot-time">${escapeHtml(time)}</span>
        <span class="escape-id-slot-status">${escapeHtml(vacancyText(status))}</span>
        <span class="escape-id-slot-action">購入へ →</span>
      </a>
    `;
  }

  return `
    <div class="escape-id-slot ${vacancyClass(status)} is-disabled">
      <span class="escape-id-slot-time">${escapeHtml(time)}</span>
      <span class="escape-id-slot-status">${escapeHtml(vacancyText(status))}</span>
    </div>
  `;
}

function renderEscapePurchaseLink(event, label) {
  const url = safePurchaseUrl(event.escapePurchaseUrl);
  if (!url) return `<span class="muted">チケットページURLが登録されていません。</span>`;

  return `<a class="escape-id-external-link" href="${escapeAttr(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} →</a>`;
}

function renderEscapeLoadError(event, message) {
  return `
    <div class="escape-id-error">
      <strong>空き状況を取得できませんでした。</strong>
      <p>${escapeHtml(message || "しばらくしてから再度お試しください。")}</p>
      ${renderEscapePurchaseLink(event, "ESCAPE.IDのチケットページを開く")}
    </div>
  `;
}

function safePurchaseUrl(value) {
  try {
    const url = new URL(String(value || ""));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch (err) {
    return "";
  }
}

function moveEscapeMonth(state, amount) {
  const next = new Date(state.currentYear, state.currentMonth + amount, 1);
  state.currentYear = next.getFullYear();
  state.currentMonth = next.getMonth();
}

function normalizeVacancyType(value) {
  const status = String(value || "NONE").toUpperCase();
  return ["MANY", "FEW", "FULL", "NOT_IN_SALES_PERIOD", "NONE"].includes(status) ? status : "NONE";
}

function vacancyText(value) {
  const map = {
    MANY: "空きあり",
    FEW: "残りわずか",
    FULL: "完売",
    NOT_IN_SALES_PERIOD: "販売期間外",
    NONE: "受付なし",
  };
  return map[normalizeVacancyType(value)];
}

function vacancyMark(value) {
  const map = {
    MANY: "○",
    FEW: "△",
    FULL: "×",
    NOT_IN_SALES_PERIOD: "―",
    NONE: "―",
  };
  return map[normalizeVacancyType(value)];
}

function vacancyClass(value) {
  return `is-${normalizeVacancyType(value).toLowerCase().replaceAll("_", "-")}`;
}

function parseYmd(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toYmd(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatJapaneseDate(value) {
  const date = parseYmd(value);
  if (Number.isNaN(date.getTime())) return String(value || "");

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  });
}

function extractTime(value) {
  const match = String(value || "").match(/(\d{2}:\d{2})(?::\d{2})?$/);
  return match ? match[1] : String(value || "");
}

function showAuthNotice() {
  if ($("authNotice")) {
    $("authNotice").classList.remove("hidden");

    const returnTo = encodeURIComponent(location.href);

    $("authNotice").innerHTML = `
      <h2>ログインが必要です</h2>
      <p class="muted">
        会員チケットの購入・発行にはログインが必要です。
        公演一覧とESCAPE.IDの空き状況はログインなしでも確認できます。
      </p>
      <a href="index.html?returnTo=${returnTo}" class="game-link">
        ログインして続ける
      </a>
    `;
  }

  $("ticketSection")?.classList.remove("hidden");
  $("logoutBtn")?.classList.add("hidden");

  if ($("userName")) $("userName").textContent = "未ログイン";
  if ($("userEmail")) $("userEmail").textContent = "会員チケットの購入・発行にはログインが必要です。";
}

function showTicketSection() {
  $("authNotice")?.classList.add("hidden");
  $("ticketSection")?.classList.remove("hidden");
  $("logoutBtn")?.classList.remove("hidden");

  if (currentUser) {
    if ($("userName")) $("userName").textContent = currentUser.name;
    if ($("userEmail")) $("userEmail").textContent = currentUser.email;
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
