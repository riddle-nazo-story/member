(() => {
  "use strict";

  const MIN_VISIBLE_MS = 900;
  const COMPLETE_HOLD_MS = 320;
  const CLEAR_ANIMATION_MS = 1500;
  const AUTO_PROGRESS_INTERVAL_MS = 180;
  const AUTO_PROGRESS_LIMIT = 89;

  let shownAt = Date.now();
  let progressValue = 0;
  let autoProgressTimer = null;
  let hideTimer = null;
  let clearTimer = null;
  let finishTimer = null;

  let bodyLocked = false;
  let previousBodyOverflow = "";

  function getOverlay() {
    return document.getElementById("memberLoadingOverlay");
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, Number(value) || 0));
  }

  function setContent(overlay, options = {}) {
    const brand = overlay.querySelector(".member-loading-brand");
    const label = overlay.querySelector(".member-loading-label");
    const title = overlay.querySelector(".member-loading-content h1");
    const text = overlay.querySelector(".member-loading-text");

    if (brand && options.brand !== undefined) {
      brand.textContent = options.brand;
    }

    if (label && options.label !== undefined) {
      label.textContent = options.label;
    }

    if (title && options.title !== undefined) {
      title.textContent = options.title;
    }

    if (text && options.text !== undefined) {
      text.textContent = options.text;
    }
  }

  function setProgress(value) {
    const overlay = getOverlay();
    if (!overlay) return;

    progressValue = clamp(value, 0, 100);

    const bar = overlay.querySelector("#memberLoadingProgressBar");
    const percent = overlay.querySelector("#memberLoadingPercent");
    const track = overlay.querySelector("#memberLoadingProgressTrack");

    if (bar) {
      bar.style.width = `${progressValue}%`;
    }

    if (percent) {
      percent.textContent = `${Math.round(progressValue)}%`;
    }

    if (track) {
      track.setAttribute("aria-valuenow", String(Math.round(progressValue)));
    }
  }

  function stopAutoProgress() {
    if (autoProgressTimer !== null) {
      window.clearInterval(autoProgressTimer);
      autoProgressTimer = null;
    }
  }

  function startAutoProgress() {
    stopAutoProgress();

    autoProgressTimer = window.setInterval(() => {
      if (progressValue >= AUTO_PROGRESS_LIMIT) {
        stopAutoProgress();
        return;
      }

      let increase = 0.4;

      if (progressValue < 28) {
        increase = 2.2 + Math.random() * 2.4;
      } else if (progressValue < 58) {
        increase = 1.1 + Math.random() * 1.8;
      } else if (progressValue < 78) {
        increase = 0.55 + Math.random() * 1.0;
      } else {
        increase = 0.18 + Math.random() * 0.42;
      }

      setProgress(Math.min(AUTO_PROGRESS_LIMIT, progressValue + increase));
    }, AUTO_PROGRESS_INTERVAL_MS);
  }

  function clearTimers() {
    if (hideTimer !== null) {
      window.clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (clearTimer !== null) {
      window.clearTimeout(clearTimer);
      clearTimer = null;
    }

    if (finishTimer !== null) {
      window.clearTimeout(finishTimer);
      finishTimer = null;
    }
  }

  function lockPage() {
    if (!document.body || bodyLocked) return;

    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    bodyLocked = true;
  }

  function unlockPage() {
    if (!document.body || !bodyLocked) return;

    document.body.style.overflow = previousBodyOverflow;
    previousBodyOverflow = "";
    bodyLocked = false;
  }

  function show(options = {}) {
    const overlay = getOverlay();
    if (!overlay) return;

    clearTimers();
    stopAutoProgress();

    setContent(overlay, options);

    overlay.classList.remove(
      "is-hidden",
      "is-completing",
      "is-clearing"
    );

    overlay.setAttribute("aria-hidden", "false");

    shownAt = Date.now();
    setProgress(options.progress !== undefined ? options.progress : 6);
    startAutoProgress();
    lockPage();
  }

  function update(options = {}) {
    const overlay = getOverlay();
    if (!overlay) return;

    setContent(overlay, options);

    if (options.progress !== undefined) {
      setProgress(options.progress);
    } else if (progressValue < 52) {
      setProgress(52);
    }
  }

  function hide() {
    const overlay = getOverlay();

    if (!overlay) {
      stopAutoProgress();
      unlockPage();
      return;
    }

    clearTimers();
    stopAutoProgress();

    const elapsed = Date.now() - shownAt;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    hideTimer = window.setTimeout(() => {
      setProgress(100);
      overlay.classList.add("is-completing");

      clearTimer = window.setTimeout(() => {
        overlay.classList.add("is-clearing");

        finishTimer = window.setTimeout(() => {
          overlay.classList.add("is-hidden");
          overlay.classList.remove("is-completing", "is-clearing");
          overlay.setAttribute("aria-hidden", "true");
          unlockPage();
        }, CLEAR_ANIMATION_MS);
      }, COMPLETE_HOLD_MS);
    }, wait);
  }

  window.RSLoader = {
    show,
    update,
    hide,
    setProgress,
  };
})();
