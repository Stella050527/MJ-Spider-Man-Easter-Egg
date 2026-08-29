(() => {
  const EFFECT_AUDIO = {
    hang: chrome.runtime.getURL("assets/spiderman-hang.webm"),
    pose: chrome.runtime.getURL("assets/spiderman-pose.webm"),
  };

  let activeAudio = null;

  function stopActiveAudio() {
    if (!activeAudio) return;
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio.load();
    activeAudio = null;
  }

  async function playEffectAudio(effectId) {
    stopActiveAudio();
    const audio = new Audio(EFFECT_AUDIO[effectId] || EFFECT_AUDIO.hang);
    audio.preload = "auto";
    activeAudio = audio;

    const cleanup = () => {
      if (activeAudio !== audio) return;
      stopActiveAudio();
    };
    audio.addEventListener("ended", cleanup, { once: true });
    audio.addEventListener("error", cleanup, { once: true });

    try {
      await audio.play();
      return true;
    } catch {
      cleanup();
      return false;
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.target !== "mj-offscreen-audio" || message.type !== "MJ_PLAY_AUDIO") return;
    playEffectAudio(message.effectId).then((played) => sendResponse({ played }));
    return true;
  });
})();
