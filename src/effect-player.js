(() => {
  globalThis.__mjEasterEgg = globalThis.__mjEasterEgg || {};
  if (globalThis.__mjEasterEgg.player) return;

  const extensionUrl = (resource) => (
    typeof chrome !== "undefined" ? chrome.runtime.getURL(resource) : resource
  );
  const EFFECTS = [
    { id: "hang", src: extensionUrl("assets/spiderman-hang.webm") },
    { id: "pose", src: extensionUrl("assets/spiderman-pose.webm") },
  ];
  const HOST_ID = "__mj_easter_egg_host";

  // Primary tuning controls for the effect's presence in the viewport.
  const ENABLE_EFFECT_AUDIO = globalThis.__mjEasterEggConfig?.effectAudioEnabled !== false;
  const EFFECT_HEIGHT_VH = 50;
  const EFFECT_MAX_HEIGHT_PX = 560;
  const EFFECT_MAX_WIDTH_VW = 94;
  const CENTER_X_MIN_PERCENT = 46;
  const CENTER_X_MAX_PERCENT = 54;
  const TOP_OFFSET_VH = -1;
  const CLEANUP_TIMEOUT_MS = 6000;
  const COOLDOWN_MS = 500;

  let activePlayback = null;
  let cooldownUntil = 0;

  function chooseEffect(randomValue = Math.random()) {
    return EFFECTS[randomValue < 0.5 ? 0 : 1];
  }

  function createOverlay(effect, forceMuted) {
    const host = document.createElement("div");
    host.id = HOST_ID;
    host.dataset.effectId = effect.id;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:2147483647",
      "pointer-events:none",
      "user-select:none",
      "overflow:visible",
      "background:transparent",
      "contain:layout style paint",
    ].join(";");

    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host { all: initial; }
      video {
        position: fixed;
        top: ${TOP_OFFSET_VH}vh;
        left: var(--mj-center-x);
        display: block;
        width: auto;
        height: min(${EFFECT_HEIGHT_VH}vh, ${EFFECT_MAX_HEIGHT_PX}px);
        max-width: ${EFFECT_MAX_WIDTH_VW}vw;
        object-fit: contain;
        transform: translateX(-50%);
        border: 0;
        outline: 0;
        background: transparent;
        pointer-events: none;
      }
      @media (max-width: 520px) {
        video {
          height: 45vh;
          max-width: calc(100vw - 16px);
        }
      }
      @media (prefers-reduced-motion: reduce) {
        video { height: min(40vh, 420px); }
      }
    `;

    const video = document.createElement("video");
    video.controls = false;
    video.playsInline = true;
    video.preload = "auto";
    video.disablePictureInPicture = true;
    video.muted = forceMuted || !ENABLE_EFFECT_AUDIO;
    video.src = effect.src;
    video.style.setProperty(
      "--mj-center-x",
      `${CENTER_X_MIN_PERCENT + Math.random() * (CENTER_X_MAX_PERCENT - CENTER_X_MIN_PERCENT)}%`,
    );

    shadow.append(style, video);
    (document.documentElement || document).append(host);
    return { host, video };
  }

  function play({ effectId, ignoreCooldown = false, forceMuted = false } = {}) {
    if (activePlayback || document.getElementById(HOST_ID)) return false;
    if (!ignoreCooldown && performance.now() < cooldownUntil) return false;
    if (!document.documentElement) return false;

    const effect = EFFECTS.find((candidate) => candidate.id === effectId) || chooseEffect();
    const { host, video } = createOverlay(effect, forceMuted);
    let finished = false;
    let timeoutId;

    const cleanup = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutId);
      video.removeEventListener("ended", cleanup);
      video.removeEventListener("error", cleanup);
      video.pause();
      video.removeAttribute("src");
      video.load();
      host.remove();
      activePlayback = null;
      cooldownUntil = performance.now() + COOLDOWN_MS;
    };

    activePlayback = { effectId: effect.id, cleanup };
    video.addEventListener("ended", cleanup, { once: true });
    video.addEventListener("error", cleanup, { once: true });
    timeoutId = setTimeout(cleanup, CLEANUP_TIMEOUT_MS);

    const attempt = video.play();
    if (attempt && typeof attempt.catch === "function") {
      attempt.catch(() => {
        if (finished || video.muted) {
          cleanup();
          return;
        }
        video.muted = true;
        video.play().catch(cleanup);
      });
    }
    return true;
  }

  function isPlaying() {
    return Boolean(activePlayback || document.getElementById(HOST_ID));
  }

  function stop() {
    activePlayback?.cleanup();
  }

  globalThis.__mjEasterEgg.player = { chooseEffect, isPlaying, play, stop };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { chooseEffect };
  }
})();
