// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const ESCAPE_ID_API_ORIGIN = "https://pubapi.escape.id";
const $ = (id) => document.getElementById(id);

let currentUser = null;
let currentEvent = null;
let confirmMode = null;
let escapeCalendarState = null;

document.addEventListener("DOMContentLoaded", init);

async function init() {
  $("logoutBtn")?.addEventListener("click", logout);
  $("showConfirmBtn")?.addEventListener("click", showFreeConfirm);
  $("showPaidConfirmBtn")?.addEventListener("click", showPaidConfirm);
  $("confirmIssueBtn")?.addEventListener("click", confirmAction);
  $("backBtn")?.addEventListener("click", hideConfirm);

  window.RSLoader?.show({
    label: "RESTORING EVENT RECORD",
    title: "この公演の記録を復元しています",
    text: "ログイン状態を確認しています……",
  });

  try {
    await restoreLoginState();

    window.RSLoader?.update({
      label: "RESTORING EVENT RECORD",
      title: "この公演の記録を復元しています",
      text: "スプレッドシートから公演情報を読み込んでいます……",
    });

    await loadEvent();
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
    const me = await api("me", { token });
    currentUser = me.user;
    $("logoutBtn")?.classList.remove("hidden");
    $("authNotice")?.classList.add("hidden");
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

async function loadEvent() {
  try {
    const eventId = new URLSearchParams(location.search).get("eventId");
    const events = await api("listEvents");
    currentEvent = (Array.isArray(events) ? events : []).find((event) => event.eventId === eventId);

    if (!currentEvent) {
      $("notFound")?.classList.remove("hidden");
      return;
    }

    renderEvent(currentEvent);
  } catch (err) {
    showMessage(err.message, "error");
  }
}

function renderEvent(event) {
  $("eventSection")?.classList.remove("hidden");
  $("eventTitle").textContent = event.title || "---";
  $("eventDescription").textContent = event.description || "";

  if (event.mainVisualUrl) {
    $("mainVisual").src = event.mainVisualUrl;
    $("mainVisual").alt = event.title || "公演メインビジュアル";
    $("mainVisual").classList.remove("hidden");
  }

  $("eventStory").innerHTML = formatMultiline(event.story || "ストーリーはまだ登録されていません。");
  $("eventNotes").innerHTML = formatMultiline(event.notes || "注意事項はまだ登録されていません。");

  hideAllTicketAreas();

  if (isEscapeIdEvent(event)) {
    $("eventTypeText").textContent = "ESCAPE.ID TICKET";
    $("ticketBoxTitle").textContent = "公演日程・チケット";
    $("escapeArea").classList.remove("hidden");
    setupEscapeCalendar(event);
    return;
  }

  $("ticketBoxTitle").textContent = "チケット";

  if (event.type === "free") {
    $("eventTypeText").textContent = "FREE TICKET";
    $("freeArea").classList.remove("hidden");
    renderCountSelect(Number(event.maxFreeTickets || 1));
    return;
  }

  $("eventTypeText").textContent = "PAID TICKET";
  $("paidArea").classList.remove("hidden");

  if (event.shopUrl) {
    $("shopLink").href = event.shopUrl;
    $("shopLink").classList.remove("hidden");
  } else {
    $("shopLink").classList.add("hidden");
  }
}

function hideAllTicketAreas() {
  $("freeArea")?.classList.add("hidden");
  $("paidArea")?.classList.add("hidden");
  $("escapeArea")?.classList.add("hidden");
  $("confirmArea")?.classList.add("hidden");
  $("resultArea")?.classList.add("hidden");
}

function isEscapeIdEvent(event) {
  return String(event.ticketProvider || "member") === "escape_id";
}

function renderCountSelect(max) {
  const safeMax = Math.max(1, Math.min(10, max));
  let html = "";

  for (let i = 1; i <= safeMax; i += 1) {
    html += `<option value="${i}">${i}枚</option>`;
  }

  $("ticketCount").innerHTML = html;
}

function showFreeConfirm() {
  if (!requireLoginOrRedirect()) return;

  confirmMode = "free";
  const count = Number($("ticketCount").value || 1);

  $("confirmText").innerHTML = `
    <p><strong>公演名：</strong>${escapeHtml(currentEvent.title)}</p>
    <p><strong>種別：</strong>無料チケット発行</p>
    <p><strong>発行枚数：</strong>${count}枚</p>
    <p class="muted">確定すると、ゲームURLが発行されます。</p>
  `;

  $("confirmArea").classList.remove("hidden");
  $("confirmArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

function showPaidConfirm() {
  if (!requireLoginOrRedirect()) return;

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
  $("confirmArea")?.classList.add("hidden");
}

async function confirmAction() {
  if (!requireLoginOrRedirect()) return;

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
    renderResult(res.tickets || []);
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
      ${tickets.map((ticket, index) => `
        <div class="mini-item">
          <h3>${index + 1}. ゲームURL</h3>

          ${ticket.gameUrl ? `
            <p><span class="code">${escapeHtml(ticket.gameUrl)}</span></p>
            <p>
              <a class="game-link" href="${escapeAttr(ticket.gameUrl)}" target="_blank" rel="noopener noreferrer">
                ゲームを開く
              </a>
              <button type="button" class="copy-url-btn ghost" data-copy-url="${escapeAttr(ticket.gameUrl)}">
                URLコピー
              </button>
            </p>
          ` : `<p class="muted">ゲームURLがありません。</p>`}
        </div>
      `).join("")}
    </div>
  `;

  $("resultList").querySelectorAll(".copy-url-btn").forEach((button) => {
    button.addEventListener("click", () => copyUrl(button.dataset.copyUrl));
  });

  $("resultArea").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function setupEscapeCalendar(event) {
  const root = $("escapeArea");
  if (!root) return;

  root.innerHTML = `
    <div class="escape-id-loading">
      <span class="escape-id-spinner" aria-hidden="true"></span>
      ESCAPE.IDから日程を読み込んでいます……
    </div>
  `;

  try {
    const data = await requestEscapeIdSlots(event);
    escapeCalendarState = createEscapeCalendarState(event, data);
    renderEscapeCalendar();
  } catch (err) {
    root.innerHTML = renderEscapeLoadError(event, err.message);
  }
}

function requestEscapeIdSlots(event) {
  const eventId = validateEscapeIdPart(event.escapeEventId, "ESCAPE.IDの公演ID");
  const locationId = validateEscapeIdPart(event.escapeLocationId, "ESCAPE.IDの会場ID");

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
  const dates = data.dates
    .filter((item) => item && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date || "")))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  const datesByDate = new Map(dates.map((item) => [String(item.date), item]));
  const today = toYmd(new Date());
  const initialItem = dates.find((item) => String(item.date) >= today) || dates[0] || null;
  const initialDate = initialItem ? parseYmd(initialItem.date) : new Date();

  return {
    event,
    data,
    dates,
    datesByDate,
    currentYear: initialDate.getFullYear(),
    currentMonth: initialDate.getMonth(),
    selectedDate: initialItem ? String(initialItem.date) : "",
  };
}

function renderEscapeCalendar() {
  const root = $("escapeArea");
  const state = escapeCalendarState;
  if (!root || !state) return;

  if (!state.dates.length) {
    root.innerHTML = `
      <div class="escape-id-empty">
        <strong>現在、公開されている日程はありません。</strong>
        ${renderEscapePurchaseLink(state.event, "ESCAPE.IDのページを確認する")}
      </div>
    `;
    return;
  }

  const selected = state.datesByDate.get(state.selectedDate) || null;
  const monthLabel = `${state.currentYear}年${state.currentMonth + 1}月`;

  root.innerHTML = `
    <section class="escape-id-calendar" aria-label="${escapeAttr(state.event.title)}の公演カレンダー">
      <div class="escape-id-calendar-head">
        <div>
          <p class="escape-id-kicker">ESCAPE.ID LIVE AVAILABILITY</p>
          <h3>${escapeHtml(monthLabel)}</h3>
        </div>

        <div class="escape-id-month-actions">
          <button type="button" class="ghost" data-calendar-prev aria-label="前の月">‹</button>
          <button type="button" class="ghost" data-calendar-next aria-label="次の月">›</button>
        </div>
      </div>

      <div class="escape-id-weekdays" aria-hidden="true">
        <span class="is-sunday">日</span>
        <span>月</span>
        <span>火</span>
        <span>水</span>
        <span>木</span>
        <span>金</span>
        <span class="is-saturday">土</span>
      </div>

      <div class="escape-id-days">
        ${renderEscapeMonthDays(state)}
      </div>

      <div class="escape-id-legend" aria-label="空き状況の見方">
        <span><b class="legend-many">○</b> 空きあり</span>
        <span><b class="legend-few">△</b> 残りわずか</span>
        <span><b class="legend-full">×</b> 完売</span>
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

  root.querySelector("[data-calendar-prev]")?.addEventListener("click", () => {
    moveEscapeMonth(state, -1);
    renderEscapeCalendar();
  });

  root.querySelector("[data-calendar-next]")?.addEventListener("click", () => {
    moveEscapeMonth(state, 1);
    renderEscapeCalendar();
  });

  root.querySelectorAll("[data-escape-date]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedDate = button.dataset.escapeDate;
      renderEscapeCalendar();
    });
  });
}

function renderEscapeMonthDays(state) {
  const first = new Date(state.currentYear, state.currentMonth, 1);
  const last = new Date(state.currentYear, state.currentMonth + 1, 0);
  const holidayMap = getJapaneseHolidayMap(state.currentYear);
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
    const dayOfWeek = date.getDay();
    const holidayName = holidayMap.get(ymd) || "";

    const dayClasses = [
      "escape-id-day",
      vacancyClass(status),
      selected ? "is-selected" : "",
      dayOfWeek === 0 ? "is-sunday" : "",
      dayOfWeek === 6 ? "is-saturday" : "",
      holidayName ? "is-holiday" : "",
      !selectable ? "is-no-event" : "",
    ].filter(Boolean).join(" ");

    const dateDescription = holidayName
      ? `${state.currentMonth + 1}月${day}日 ${holidayName} ${vacancyText(status)}`
      : `${state.currentMonth + 1}月${day}日 ${vacancyText(status)}`;

    cells.push(`
      <button
        type="button"
        class="${dayClasses}"
        ${selectable ? `data-escape-date="${escapeAttr(ymd)}"` : "disabled"}
        aria-label="${escapeAttr(dateDescription)}"
        title="${escapeAttr(holidayName || dateDescription)}"
      >
        <span class="escape-id-day-top">
          <span class="escape-id-day-number">${day}</span>
          ${holidayName ? `<span class="escape-id-holiday-label">祝</span>` : ""}
        </span>
        ${holidayName ? `<span class="escape-id-holiday-name">${escapeHtml(holidayName)}</span>` : `<span class="escape-id-holiday-name" aria-hidden="true"></span>`}
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
  const startTime = extractTime(slot.startAt);
  const endTime = extractTime(slot.endAt);
  const time = endTime ? `${startTime}〜${endTime}` : startTime;
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

  if (!url) {
    return `<span class="muted">チケットページURLが登録されていません。</span>`;
  }

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
  return ["MANY", "FEW", "FULL", "NOT_IN_SALES_PERIOD", "NONE"].includes(status)
    ? status
    : "NONE";
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

function getJapaneseHolidayMap(year) {
  const base = new Map();

  addHoliday(base, year, 1, 1, "元日");
  addHoliday(base, year, 1, nthWeekdayOfMonth(year, 1, 1, 2), "成人の日");
  addHoliday(base, year, 2, 11, "建国記念の日");
  if (year >= 2020) addHoliday(base, year, 2, 23, "天皇誕生日");
  addHoliday(base, year, 3, vernalEquinoxDay(year), "春分の日");
  addHoliday(base, year, 4, 29, "昭和の日");
  addHoliday(base, year, 5, 3, "憲法記念日");
  addHoliday(base, year, 5, 4, "みどりの日");
  addHoliday(base, year, 5, 5, "こどもの日");

  if (year === 2020) {
    addHoliday(base, year, 7, 23, "海の日");
    addHoliday(base, year, 7, 24, "スポーツの日");
    addHoliday(base, year, 8, 10, "山の日");
  } else if (year === 2021) {
    addHoliday(base, year, 7, 22, "海の日");
    addHoliday(base, year, 7, 23, "スポーツの日");
    addHoliday(base, year, 8, 8, "山の日");
  } else {
    addHoliday(base, year, 7, nthWeekdayOfMonth(year, 7, 1, 3), "海の日");
    addHoliday(base, year, 8, 11, "山の日");
    addHoliday(base, year, 10, nthWeekdayOfMonth(year, 10, 1, 2), "スポーツの日");
  }

  addHoliday(base, year, 9, nthWeekdayOfMonth(year, 9, 1, 3), "敬老の日");
  addHoliday(base, year, 9, autumnEquinoxDay(year), "秋分の日");
  addHoliday(base, year, 11, 3, "文化の日");
  addHoliday(base, year, 11, 23, "勤労感謝の日");

  if (year === 2019) {
    addHoliday(base, year, 5, 1, "天皇の即位の日");
    addHoliday(base, year, 10, 22, "即位礼正殿の儀の行われる日");
  }

  addCitizensHolidays(base, year);
  addSubstituteHolidays(base, year);

  return base;
}

function addHoliday(map, year, month, day, name) {
  if (!day) return;
  map.set(toYmd(new Date(year, month - 1, day)), name);
}

function addCitizensHolidays(map, year) {
  const start = new Date(year, 0, 2);
  const end = new Date(year, 11, 30);

  for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
    const ymd = toYmd(date);
    if (map.has(ymd) || date.getDay() === 0) continue;

    const previous = new Date(date);
    previous.setDate(previous.getDate() - 1);
    const next = new Date(date);
    next.setDate(next.getDate() + 1);

    if (map.has(toYmd(previous)) && map.has(toYmd(next))) {
      map.set(ymd, "国民の休日");
    }
  }
}

function addSubstituteHolidays(map, year) {
  const originalHolidays = Array.from(map.entries())
    .filter(([ymd]) => parseYmd(ymd).getFullYear() === year)
    .sort(([a], [b]) => a.localeCompare(b));

  originalHolidays.forEach(([ymd]) => {
    const holiday = parseYmd(ymd);
    if (holiday.getDay() !== 0) return;

    const substitute = new Date(holiday);
    substitute.setDate(substitute.getDate() + 1);

    while (map.has(toYmd(substitute))) {
      substitute.setDate(substitute.getDate() + 1);
    }

    if (substitute.getFullYear() === year) {
      map.set(toYmd(substitute), "振替休日");
    }
  });
}

function nthWeekdayOfMonth(year, month, weekday, nth) {
  const first = new Date(year, month - 1, 1);
  const offset = (7 + weekday - first.getDay()) % 7;
  return 1 + offset + (nth - 1) * 7;
}

function vernalEquinoxDay(year) {
  if (year < 1980 || year > 2099) return 20;
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnEquinoxDay(year) {
  if (year < 1980 || year > 2099) return 23;
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
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
  const returnTo = encodeURIComponent(location.href);

  if ($("authNotice")) {
    $("authNotice").classList.remove("hidden");
    $("authNotice").innerHTML = `
      <h2>ログインしていません</h2>
      <p class="muted">
        公演内容とESCAPE.IDの日程は確認できます。<br>
        会員チケットの発行・認証にはログインが必要です。
      </p>
      <a href="index.html?returnTo=${returnTo}" class="game-link">ログインして続ける</a>
    `;
  }

  $("logoutBtn")?.classList.add("hidden");
}

function requireLoginOrRedirect() {
  if (getToken()) return true;

  const returnTo = encodeURIComponent(location.href);
  location.href = `index.html?returnTo=${returnTo}`;
  return false;
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
  return escapeHtml(text)
    .split("\n")
    .filter(Boolean)
    .map((line) => `<p>${line}</p>`)
    .join("");
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
