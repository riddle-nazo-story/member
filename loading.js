(() => {
  "use strict";

  const MIN_VISIBLE_MS = 700;
  const CLOSE_ANIMATION_MS = 700;

  let shownAt = Date.now();
  let hideTimer = null;
  let finishTimer = null;
  let bodyLocked = false;
  let previousBodyOverflow = "";

  function getOverlay() {
    return document.getElementById("memberLoadingOverlay");
  }

  function setContent(overlay, options = {}) {
    const brand = overlay.querySelector(".member-loading-brand");
    const core = overlay.querySelector(".member-loading-core");
    const label = overlay.querySelector(".member-loading-label");
    const title = overlay.querySelector(".member-loading-content h1");
    const text = overlay.querySelector(".member-loading-text");

    if (brand && options.brand !== undefined) {
      brand.textContent = options.brand;
    }

    if (core && options.core !== undefined) {
      core.textContent = options.core;
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

    clearTimeout(hideTimer);
    clearTimeout(finishTimer);

    setContent(overlay, options);

    overlay.classList.remove("is-hidden", "is-closing");
    overlay.setAttribute("aria-hidden", "false");

    shownAt = Date.now();
    lockPage();
  }

  function update(options = {}) {
    const overlay = getOverlay();
    if (!overlay) return;

    setContent(overlay, options);
  }

  function hide() {
    const overlay = getOverlay();

    if (!overlay) {
      unlockPage();
      return;
    }

    clearTimeout(hideTimer);
    clearTimeout(finishTimer);

    const elapsed = Date.now() - shownAt;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);

    hideTimer = window.setTimeout(() => {
      overlay.classList.add("is-closing");

      finishTimer = window.setTimeout(() => {
        overlay.classList.add("is-hidden");
        overlay.classList.remove("is-closing");
        overlay.setAttribute("aria-hidden", "true");
        unlockPage();
      }, CLOSE_ANIMATION_MS);
    }, wait);
  }

  window.RSLoader = {
    show,
    update,
    hide,
  };
})();
