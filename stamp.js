// GASのWebアプリURL
const API_URL = "https://script.google.com/macros/s/AKfycbwZJGvGsEXSeMRPNU_jzqTvYyA5yhNbIAR-ZprH0O4Wbl6CeJX6YzWTpXS5_WUPVA45dQ/exec";

const TOKEN_KEY = "rs_member_token";
const RETURN_TO_KEY = "rs_return_to";

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", initStamp);

async function initStamp() {
  const params = new URLSearchParams(location.search);
  const stampCode = params.get("code") || params.get("stampCode");

  if (!stampCode) {
    setStampResult(
      "スタンプコードがありません",
      "URLが正しくありません。もう一度QRコードを読み込んでください。"
    );
    return;
  }

  const token = localStorage.getItem(TOKEN_KEY);

  if (!token) {
    sessionStorage.setItem(RETURN_TO_KEY, location.href);

    setStampResult(
      "ログインが必要です",
      "スタンプを取得するにはログインしてください。ログイン後、このページに自動で戻ります。",
      `<a href="index.html?returnTo=${encodeURIComponent(location.href)}" class="game-link">ログインしてスタンプを取得</a>`
    );

    return;
  }

  try {
    const res = await api("redeemStampCode", {
      token,
      stampCode,
    });

    setStampResult(
      "スタンプを取得しました",
      `${res.event.title} のスタンプを取得しました。 +${res.point}pt`,
      `<a href="index.html" class="game-link">会員サイトへ戻る</a>`
    );
  } catch (err) {
    setStampResult(
      "スタンプを取得できませんでした",
      err.message,
      `<a href="index.html" class="game-link">会員サイトへ戻る</a>`
    );
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

function setStampResult(title, message, actionHtml = "") {
  $("stampTitle").textContent = title;
  $("stampMessage").textContent = message;
  $("stampAction").innerHTML = actionHtml;
}
