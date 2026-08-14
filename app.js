// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbx68_hw9Zon-CVBIvyrGGnlL2uDGBKJOGkNvXtFx1bBtI1CcrAM2K1nHyn3-Xvq7UAczA/exec";

const TOKEN_KEY = "rs_member_token";
const RETURN_TO_KEY = "rs_return_to";

const $ = (id) => document.getElementById(id);

let currentUser = null;

function isArgAccount(user = currentUser) {
  return String(user?.accountType || "normal") === "arg";
}

function applyArgAccountRestrictions(user = currentUser) {
  const arg = isArgAccount(user);

  // チケット購入/発行への導線
  document.querySelectorAll('a[href="ticket.html"], a[href^="ticket.html?"]').forEach((el) => {
    el.classList.toggle("hidden", arg);
  });

  // スタンプ獲得UIだけを隠す（取得済みスタンプ履歴は残す）
  const redeemButton = $("redeemStampBtn");
  const stampAcquireCard = redeemButton ? redeemButton.closest(".card") : null;
  if (stampAcquireCard) stampAcquireCard.classList.toggle("hidden", arg);

  // アカウント設定（パスワード変更・退会）
  if ($("accountBtn")) $("accountBtn").classList.toggle("hidden", arg);
  document.querySelectorAll('.tab[data-tab="account"]').forEach((el) => el.classList.toggle("hidden", arg));
  if ($("tab-account")) $("tab-account").classList.toggle("hidden", arg);

  // ARGアカウントで禁止タブを開いていた場合はマイページへ戻す
  const activeAccount = document.querySelector('.tab[data-tab="account"].active');
  if (arg && activeAccount && $("tab-mypage")) switchTab("mypage");
}
let qrScanner = null;
let qrBusy = false;

// ページ切り替え用
let ticketPageIndex = 0;
let ticketItemsCache = [];
let ticketEventFilter = "all";

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

  if (window.RSLoader) {
    RSLoader.show({
      label: "CHECKING MEMBER RECORD",
      title: "あなたの記録を照合しています",
      text: "会員情報を確認しています……",
    });
  }

  const token = getToken();

  if (token) {
    try {
      const res = await api("me", { token });
      currentUser = res.user;
      applyArgAccountRestrictions(currentUser);

      if (window.RSLoader) {
        RSLoader.update({
          label: "RESTORING YOUR STORY",
          title: "あなたの物語を復元しています",
          text: "ゲーム・参加記録・スタンプ情報を読み込んでいます……",
        });
      }

      showMember();
      await loadMyData();

      if (window.RSLoader) {
        RSLoader.hide();
      }
    } catch (err) {
      localStorage.removeItem(TOKEN_KEY);
      currentUser = null;
      showAuth();

      if (window.RSLoader) {
        RSLoader.hide();
      }
    }
  } else {
    showAuth();

    if (window.RSLoader) {
      RSLoader.hide();
    }
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
  addClick("accountBtn", openAccountSettings);
  addClick("changePasswordBtn", changePassword);
  addClick("deleteAccountBtn", deleteAccount);

  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  document.querySelectorAll("[data-open-tab]").forEach((link) => {
    link.addEventListener("click", () => switchTab(link.dataset.openTab));
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

    if (window.RSLoader) {
      RSLoader.show({
        label: "VERIFYING IDENTITY",
        title: "あなたの記録を探しています",
        text: "ログイン情報を照合しています……",
      });
    }

    const res = await api("login", {
      email,
      password,
    });

    localStorage.setItem(TOKEN_KEY, res.token);
    currentUser = res.user;
    applyArgAccountRestrictions(currentUser);

    showMessage("ログインしました。", "ok");

    if (redirectAfterLoginIfNeeded()) {
      return;
    }

    if (window.RSLoader) {
      RSLoader.update({
        label: "RESTORING YOUR STORY",
        title: "あなたの物語を復元しています",
        text: "ゲーム・参加記録・スタンプ情報を読み込んでいます……",
      });
    }

    showMember();
    await loadMyData();

    if (window.RSLoader) {
      RSLoader.hide();
    }
  } catch (err) {
    if (window.RSLoader) {
      RSLoader.hide();
    }

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

    if (window.RSLoader) {
      RSLoader.show({
        label: "CREATING NEW RECORD",
        title: "新しい記録を作成しています",
        text: "あなたの情報を登録しています……",
      });
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
    applyArgAccountRestrictions(currentUser);

    showMessage(res.message || "会員登録が完了しました。", "ok");

    if (redirectAfterLoginIfNeeded()) {
      return;
    }

    if (window.RSLoader) {
      RSLoader.update({
        label: "RESTORING YOUR STORY",
        title: "あなたの物語を復元しています",
        text: "ゲーム・参加記録・スタンプ情報を読み込んでいます……",
      });
    }

    showMember();
    await loadMyData();

    if (window.RSLoader) {
      RSLoader.hide();
    }
  } catch (err) {
    if (window.RSLoader) {
      RSLoader.hide();
    }

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
  if (isArgAccount()) {
    showMessage("ARG用アカウントではスタンプを取得できません。", "error");
    return;
  }

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
  applyArgAccountRestrictions(data.user);
  renderEmailArea(data.user);

  renderTickets(data.tickets || []);
  renderParticipations(data.participations || []);
  renderStamps(data.stamps || []);
}

/* =========================
   ゲームURL：公演別フィルター＋3件ずつ表示
========================= */

function renderTickets(tickets) {
  const root = $("myTickets");

  if (!root) return;

  if (!tickets || !tickets.length) {
    ticketItemsCache = [];
    ticketEventFilter = "all";
    ticketPageIndex = 0;
    root.innerHTML = `<p class="muted">まだチケットはありません。チケット購入サイトから発行してください。</p>`;
    return;
  }

  ticketItemsCache = tickets;
  ticketPageIndex = 0;

  const availableEventKeys = new Set(tickets.map((ticket) => getTicketEventKey(ticket)));

  if (ticketEventFilter !== "all" && !availableEventKeys.has(ticketEventFilter)) {
    ticketEventFilter = "all";
  }

  renderTicketPage();
}

function getTicketEventKey(ticket) {
  return String(ticket.eventId || ticket.eventTitle || "event-unknown");
}

function getTicketEventGroups(tickets) {
  const groups = new Map();

  tickets.forEach((ticket) => {
    const key = getTicketEventKey(ticket);
    const title = ticket.eventTitle || ticket.eventId || "公演名なし";

    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title,
        count: 0,
      });
    }

    groups.get(key).count += 1;
  });

  return Array.from(groups.values());
}

function getFilteredTicketItems() {
  if (ticketEventFilter === "all") {
    return ticketItemsCache;
  }

  return ticketItemsCache.filter((ticket) => {
    return getTicketEventKey(ticket) === ticketEventFilter;
  });
}

function renderTicketPage() {
  const root = $("myTickets");

  if (!root) return;

  const eventGroups = getTicketEventGroups(ticketItemsCache);
  const validFilterKeys = new Set(eventGroups.map((group) => group.key));

  if (ticketEventFilter !== "all" && !validFilterKeys.has(ticketEventFilter)) {
    ticketEventFilter = "all";
  }

  const filteredTickets = getFilteredTicketItems();
  const totalPages = Math.ceil(filteredTickets.length / TICKETS_PER_PAGE);

  if (ticketPageIndex >= totalPages) {
    ticketPageIndex = Math.max(0, totalPages - 1);
  }

  const start = ticketPageIndex * TICKETS_PER_PAGE;
  const pageTickets = filteredTickets.slice(start, start + TICKETS_PER_PAGE);
  const selectedGroup = eventGroups.find((group) => group.key === ticketEventFilter);
  const selectedLabel = ticketEventFilter === "all"
    ? "すべての公演を表示しています"
    : `${selectedGroup ? selectedGroup.title : "選択した公演"}のURLを表示しています`;

  root.innerHTML = `
    <div class="game-library">
      <div class="game-filter-panel">
        <label class="game-filter-label" for="gameEventFilter">
          <span class="eyebrow">SELECT EVENT</span>
          <strong>表示する公演</strong>
          <span>公演を選ぶと、その公演で発行されたゲームURLだけを表示します。</span>
        </label>

        <div class="game-filter-select-wrap">
          <select id="gameEventFilter" class="game-event-filter" aria-label="表示する公演を選択">
            <option value="all" ${ticketEventFilter === "all" ? "selected" : ""}>
              すべて表示（${ticketItemsCache.length}件）
            </option>
            ${eventGroups.map((group) => `
              <option value="${escapeAttr(group.key)}" ${ticketEventFilter === group.key ? "selected" : ""}>
                ${escapeHtml(group.title)}（${group.count}件）
              </option>
            `).join("")}
          </select>
        </div>
      </div>

      <div class="game-library-summary">
        <div>
          <strong>${filteredTickets.length}件のゲームURL</strong>
          <span>${escapeHtml(selectedLabel)}</span>
        </div>
        ${totalPages > 1 ? `<span class="game-page-count">${ticketPageIndex + 1} / ${totalPages}ページ</span>` : ""}
      </div>

      <div class="game-entry-list">
        ${pageTickets.map((t, index) => {
          const displayGameStatus = getDisplayGameStatus(t);
          const statusView = getGameStatusView(displayGameStatus, !!t.gameUrl);
          const canOpen = !!t.gameUrl && !["expired", "blocked"].includes(displayGameStatus);
          const itemNumber = start + index + 1;

          return `
            <article class="game-entry status-${statusView.className}">
              <div class="game-entry-head">
                <div class="game-entry-title">
                  <span class="game-entry-number">URL ${String(itemNumber).padStart(2, "0")}</span>
                  <h3>${escapeHtml(t.eventTitle || t.eventId || "公演名なし")}</h3>
                </div>
                <span class="game-status-badge status-${statusView.className}">${statusView.label}</span>
              </div>

              <p class="game-status-message">${statusView.message}</p>

              <div class="game-primary-action">
                ${canOpen ? `
                  <a href="${escapeAttr(t.gameUrl)}" target="_blank" rel="noopener" class="game-play-button">
                    <span aria-hidden="true">▶</span>
                    ${getGameActionLabel(displayGameStatus)}
                  </a>
                ` : `
                  <span class="game-play-button disabled" aria-disabled="true">
                    <span aria-hidden="true">×</span>
                    ${t.gameUrl ? "現在はプレイできません" : "URLを準備中です"}
                  </span>
                `}

                ${t.gameUrl ? `
                  <button type="button" class="copy-url-btn ghost game-copy-button" data-copy-url="${escapeAttr(t.gameUrl)}">
                    ゲームURLをコピー
                  </button>

                  ${!isArgAccount() ? `<button
                    type="button"
                    class="delete-url-btn ghost game-delete-button"
                    data-ticket-id="${escapeAttr(t.ticketId || "")}"
                    data-game-token="${escapeAttr(t.gameToken || "")}"
                    data-event-title="${escapeAttr(t.eventTitle || t.eventId || "この公演")}"
                  >
                    このURLを削除
                  </button>` : ""}
                ` : ""}
              </div>

              <dl class="game-meta-list">
                <div>
                  <dt>プレイ状況</dt>
                  <dd>${statusView.label}</dd>
                </div>
                <div>
                  <dt>URLの有効期限</dt>
                  <dd>${t.gameExpiresAt ? formatGameExpiry(t.gameExpiresAt, displayGameStatus) : "期限の設定なし"}</dd>
                </div>
              </dl>

              ${t.gameUrl ? `
                <details class="game-url-details">
                  <summary>発行されたURLを確認する</summary>
                  <p>${escapeHtml(t.gameUrl)}</p>
                </details>
              ` : ""}
            </article>
          `;
        }).join("")}
      </div>

      ${renderPager(totalPages, ticketPageIndex, "ticket")}
    </div>
  `;

  const eventFilterSelect = root.querySelector("#gameEventFilter");

  if (eventFilterSelect) {
    eventFilterSelect.addEventListener("change", () => {
      ticketEventFilter = eventFilterSelect.value;
      ticketPageIndex = 0;
      renderTicketPage();
    });
  }

  root.querySelectorAll(".copy-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => copyUrl(btn.dataset.copyUrl));
  });

  root.querySelectorAll(".delete-url-btn").forEach((btn) => {
    btn.addEventListener("click", () => deleteIssuedUrl(btn));
  });

  root.querySelectorAll("[data-ticket-page]").forEach((btn) => {
    btn.addEventListener("click", () => {
      ticketPageIndex = Number(btn.dataset.ticketPage);
      renderTicketPage();
      root.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}


async function deleteIssuedUrl(button) {
  if (isArgAccount()) {
    showMessage("ARG用アカウントではゲームURLを削除できません。", "error");
    return;
  }

  try {
    const ticketId = String(button?.dataset.ticketId || "").trim();
    const gameToken = String(button?.dataset.gameToken || "").trim();
    const eventTitle = String(button?.dataset.eventTitle || "この公演").trim();

    if (!ticketId && !gameToken) {
      showMessage("削除するURLの情報が見つかりません。", "error");
      return;
    }

    const ok = window.confirm(
      `${eventTitle}で発行したこのゲームURLを削除しますか？\n\n` +
      "削除すると、このURLは会員サイトとスプレッドシートから消え、今後そのtokenではプレイできなくなります。\n" +
      "この操作は元に戻せません。"
    );

    if (!ok) return;

    button.disabled = true;
    const originalText = button.textContent;
    button.textContent = "削除中…";

    const res = await api("deleteMyIssuedUrl", {
      token: getToken(),
      ticketId,
      gameToken,
    });

    showMessage(res.message || "ゲームURLを削除しました。", "ok");

    // スプレッドシート側の削除後、一覧も最新状態へ更新
    await loadMyData();
  } catch (err) {
    showMessage(err.message, "error");

    if (button) {
      button.disabled = false;
      button.textContent = "このURLを削除";
    }
  }
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
   アカウント設定
========================= */

function openAccountSettings() {
  switchTab("account");

  const section = $("tab-account");
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

async function changePassword() {
  if (isArgAccount()) {
    showMessage("ARG用アカウントのパスワードは運営側で管理されています。", "error");
    return;
  }

  try {
    const currentPassword = $("currentPassword")?.value || "";
    const newPassword = $("newPassword")?.value || "";
    const confirmPassword = $("newPasswordConfirm")?.value || "";

    if (!currentPassword) {
      showMessage("現在のパスワードを入力してください。", "error");
      return;
    }

    if (newPassword.length < 6) {
      showMessage("新しいパスワードは6文字以上にしてください。", "error");
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage("新しいパスワードが一致しません。", "error");
      return;
    }

    if (currentPassword === newPassword) {
      showMessage("現在とは異なるパスワードを設定してください。", "error");
      return;
    }

    const button = $("changePasswordBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "変更しています…";
    }

    const res = await api("changePassword", {
      token: getToken(),
      currentPassword,
      newPassword,
    });

    if ($("currentPassword")) $("currentPassword").value = "";
    if ($("newPassword")) $("newPassword").value = "";
    if ($("newPasswordConfirm")) $("newPasswordConfirm").value = "";

    showMessage(res.message || "パスワードを変更しました。", "ok");
  } catch (err) {
    showMessage(err.message, "error");
  } finally {
    const button = $("changePasswordBtn");
    if (button) {
      button.disabled = false;
      button.textContent = "パスワードを変更する";
    }
  }
}

async function deleteAccount() {
  if (isArgAccount()) {
    showMessage("ARG用アカウントは参加者側から削除できません。", "error");
    return;
  }

  try {
    const password = $("deleteAccountPassword")?.value || "";
    const phrase = $("deleteAccountPhrase")?.value.trim() || "";

    if (!password) {
      showMessage("現在のパスワードを入力してください。", "error");
      return;
    }

    if (phrase !== "退会する") {
      showMessage("確認欄に「退会する」と入力してください。", "error");
      return;
    }

    const firstConfirm = window.confirm(
      "本当に退会しますか？\n\n会員情報・会員サイトで発行したチケット・スタンプ履歴・参加履歴などが削除されます。\nこの操作は取り消せません。"
    );

    if (!firstConfirm) return;

    const secondConfirm = window.confirm(
      "最終確認です。\n退会処理を実行すると元に戻せません。\n\n退会を実行しますか？"
    );

    if (!secondConfirm) return;

    const button = $("deleteAccountBtn");
    if (button) {
      button.disabled = true;
      button.textContent = "退会処理中…";
    }

    const res = await api("deleteAccount", {
      token: getToken(),
      password,
      confirmation: "DELETE",
    });

    stopQr();
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    currentUser = null;

    alert(res.message || "退会が完了しました。");
    location.href = "index.html";
  } catch (err) {
    showMessage(err.message, "error");

    const button = $("deleteAccountBtn");
    if (button) {
      button.disabled = false;
      button.textContent = "退会する";
    }
  }
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
  const loading = $("memberLoading");

  if (loading) {
    loading.classList.add("hidden");
  }

  $("authSection").classList.remove("hidden");
  $("memberSection").classList.add("hidden");
  $("logoutBtn").classList.add("hidden");
  $("accountBtn")?.classList.add("hidden");
}

function showMember() {
  const loading = $("memberLoading");

  if (loading) {
    loading.classList.add("hidden");
  }

  $("authSection").classList.add("hidden");
  $("memberSection").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");
  $("accountBtn")?.classList.remove("hidden");
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

function getGameStatusView(status, hasUrl) {
  if (!hasUrl) {
    return {
      className: "pending",
      label: "準備中",
      message: "ゲームURLが発行されるまで、しばらくお待ちください。",
    };
  }

  const map = {
    unused: {
      className: "ready",
      label: "プレイできます",
      message: "準備ができています。下のボタンからゲームを開始してください。",
    },
    active: {
      className: "playing",
      label: "プレイ中",
      message: "このゲームは開始済みです。下のボタンから続きに戻れます。",
    },
    used: {
      className: "playing",
      label: "プレイ中",
      message: "このゲームは開始済みです。下のボタンから続きに戻れます。",
    },
    cleared: {
      className: "cleared",
      label: "クリア済み",
      message: "クリア済みのゲームです。結果画面をもう一度確認できます。",
    },
    expired: {
      className: "expired",
      label: "期限切れ",
      message: "このゲームURLの有効期限が終了しているため、現在はプレイできません。",
    },
    blocked: {
      className: "blocked",
      label: "利用できません",
      message: "このゲームURLは無効になっています。必要な場合は運営へお問い合わせください。",
    },
  };

  return map[status] || {
    className: "ready",
    label: "プレイできます",
    message: "下のボタンからゲームを開始してください。",
  };
}

function getGameActionLabel(status) {
  if (status === "active" || status === "used") return "ゲームの続きを開く";
  if (status === "cleared") return "クリア画面を開く";
  return "ゲームをプレイする";
}

function formatGameExpiry(value, status) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return formatDate(value);
  }

  if (status === "expired") {
    return `${formatDate(value)}（終了）`;
  }

  const diff = date.getTime() - Date.now();
  const hours = Math.ceil(diff / (1000 * 60 * 60));

  if (hours <= 0) {
    return `${formatDate(value)}（終了）`;
  }

  if (hours < 24) {
    return `${formatDate(value)}（あと約${hours}時間）`;
  }

  const days = Math.ceil(hours / 24);
  return `${formatDate(value)}（あと約${days}日）`;
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

