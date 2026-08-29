(() => {
  const api = globalThis.__mjEasterEgg;
  if (!api?.detector || !api?.player) return;
  if (api.contentInitialized) return;
  api.contentInitialized = true;
  const contentController = new AbortController();
  const listenerOptions = { capture: true, signal: contentController.signal };
  api.contentController = contentController;
  let backgroundPort = null;
  try {
    backgroundPort = chrome.runtime.connect({ name: "mj-easter-egg" });
    backgroundPort.onDisconnect.addListener(() => {
      backgroundPort = null;
    });
    api.backgroundPort = backgroundPort;
  } catch {
    // Dynamic reinjection will restore the port after an extension reload.
  }

  let isComposing = false;
  let lastEditableContext = null;
  let lastPointerControl = null;
  let lastPointerTriggerAt = 0;
  const consumedTextByEditable = new WeakMap();
  const pressedChordKeys = new Set();
  let chordHasTriggered = false;
  let chordReleaseObserved = false;
  const EDITABLE_CONTEXT_TTL_MS = 5 * 60 * 1000;
  const shortcutConfig = globalThis.__mjEasterEggConfig?.shortcut || {};
  const genericClearTriggerEnabled = globalThis.__mjEasterEggConfig?.genericClearTriggerEnabled === true;
  const configuredShortcutKey = normalizeChordKey(String(shortcutConfig.key || ""));
  const shortcutEnabled = shortcutConfig.enabled !== false
    && configuredShortcutKey
    && configuredShortcutKey !== "control";
  const CHORD_KEYS = new Set(shortcutEnabled ? ["control", configuredShortcutKey] : []);
  const CLEAR_CHECK_DELAYS_MS = [0, 50, 150, 300];

  function rememberEditable(editable) {
    if (!editable) return;
    const text = api.detector.textBeforeCaret(editable);
    if (typeof text !== "string") return;
    const fullText = api.detector.textOfEditable(editable);
    const consumedText = consumedTextByEditable.get(editable);
    if (consumedText !== undefined && consumedText !== fullText) {
      consumedTextByEditable.delete(editable);
    }
    lastEditableContext = {
      editable,
      fullText,
      text,
      timestamp: performance.now(),
      triggered: consumedText === fullText,
    };
  }

  function markEditableConsumed(context = lastEditableContext) {
    if (!context) return;
    context.triggered = true;
    if (context.editable.isConnected) {
      consumedTextByEditable.set(context.editable, api.detector.textOfEditable(context.editable));
    }
  }

  function rememberEditableFromEvent(event) {
    rememberEditable(api.detector.findEditable(event.composedPath()));
  }

  function playWhenDocumentReady(reason = "text", effectId) {
    const options = { effectId, ignoreCooldown: reason === "chord" };
    if (document.documentElement) {
      return api.player.play(options);
    }
    document.addEventListener("readystatechange", () => api.player.play(options), { once: true });
    return true;
  }

  function requestEffect(reason = "text") {
    const effectId = api.player.chooseEffect().id;
    const accepted = window !== window.top || playWhenDocumentReady(reason, effectId);
    if (!accepted) return false;

    const message = {
      type: "MJ_TRIGGER",
      reason,
      effectId,
      triggeredAt: Date.now(),
    };
    try {
      if (backgroundPort) {
        backgroundPort.postMessage(message);
      } else {
        chrome.runtime.sendMessage(message).catch(() => {});
      }
    } catch {
      // A manually reloaded extension invalidates old content-script messaging.
    }
    return true;
  }

  function armClearDetection(eventPath) {
    const context = lastEditableContext;
    if (!context || context.triggered || !/^\s*mj\s*$/i.test(context.fullText)) return context;
    if (eventPath.includes(context.editable)) return context;

    const watchToken = {};
    context.watchToken = watchToken;
    for (const delay of CLEAR_CHECK_DELAYS_MS) {
      setTimeout(() => {
        if (contentController.signal.aborted || context.triggered || context.watchToken !== watchToken) return;
        const wasRemoved = !context.editable.isConnected;
        const currentText = wasRemoved ? "" : api.detector.textOfEditable(context.editable);
        if (!wasRemoved && currentText.trim() !== "") return;
        if (requestEffect("text")) markEditableConsumed(context);
      }, delay);
    }
    return context;
  }

  function normalizeChordKey(key) {
    const normalized = key.toLowerCase();
    return normalized === "ctrl" ? "control" : normalized;
  }

  function isChordComplete() {
    return [...CHORD_KEYS].every((key) => pressedChordKeys.has(key));
  }

  function handleChordKeyDown(event) {
    const key = normalizeChordKey(event.key);
    if (!CHORD_KEYS.has(key)) return;

    const wasComplete = isChordComplete();
    pressedChordKeys.add(key);
    if (wasComplete || !isChordComplete()) return;
    if (chordHasTriggered && !chordReleaseObserved) return;
    if (window === window.top && api.player.isPlaying()) return;
    if (!requestEffect("chord")) return;

    chordHasTriggered = true;
    chordReleaseObserved = false;
  }

  function handleChordKeyUp(event) {
    const key = normalizeChordKey(event.key);
    if (!CHORD_KEYS.has(key)) return;
    const wasComplete = isChordComplete();
    pressedChordKeys.delete(key);
    if (chordHasTriggered && wasComplete && !isChordComplete()) chordReleaseObserved = true;
  }

  function resetChordKeys() {
    if (chordHasTriggered && pressedChordKeys.size > 0) chordReleaseObserved = true;
    pressedChordKeys.clear();
  }

  function editableBelongsToControl(editable, control) {
    if (!editable?.isConnected || editable.ownerDocument !== control.ownerDocument) return false;
    if (control.form && editable instanceof HTMLInputElement) return editable.form === control.form;
    if (control.form && editable instanceof HTMLTextAreaElement) return editable.form === control.form;
    if (control.form && !control.form.contains(editable)) return false;
    return true;
  }

  function shouldTriggerFromSendControl(control) {
    if (!api.detector.isSendControl(control) || !lastEditableContext || lastEditableContext.triggered) return false;
    if (performance.now() - lastEditableContext.timestamp > EDITABLE_CONTEXT_TTL_MS) return false;
    if (!editableBelongsToControl(lastEditableContext.editable, control)) return false;

    const currentText = api.detector.textBeforeCaret(lastEditableContext.editable);
    const text = typeof currentText === "string" ? currentText : lastEditableContext.text;
    return api.detector.hasMjToken(text);
  }

  document.addEventListener("compositionstart", () => {
    isComposing = true;
  }, listenerOptions);

  document.addEventListener("compositionend", () => {
    isComposing = false;
  }, listenerOptions);

  document.addEventListener("focusin", rememberEditableFromEvent, listenerOptions);
  document.addEventListener("input", rememberEditableFromEvent, listenerOptions);
  document.addEventListener("keyup", rememberEditableFromEvent, listenerOptions);

  document.addEventListener("keydown", (event) => {
    handleChordKeyDown(event);
    rememberEditableFromEvent(event);
    if (!api.detector.shouldTrigger(event, isComposing)) return;
    if (lastEditableContext?.triggered) return;
    if (requestEffect()) markEditableConsumed();
  }, listenerOptions);

  document.addEventListener("keyup", handleChordKeyUp, listenerOptions);
  window.addEventListener("blur", resetChordKeys, listenerOptions);

  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    const eventPath = event.composedPath();
    const control = api.detector.findSendControl(eventPath);
    const genericActionControl = !control && genericClearTriggerEnabled
      ? api.detector.findActionControl(eventPath)
      : null;
    const clearContext = genericActionControl ? armClearDetection(eventPath) : lastEditableContext;
    if (!control || !shouldTriggerFromSendControl(control)) return;
    lastPointerControl = control;
    lastPointerTriggerAt = performance.now();
    if (requestEffect()) markEditableConsumed(clearContext);
  }, listenerOptions);

  document.addEventListener("click", (event) => {
    const control = api.detector.findSendControl(event.composedPath());
    if (!control) return;
    if (control === lastPointerControl && performance.now() - lastPointerTriggerAt < 1000) return;
    if (shouldTriggerFromSendControl(control) && requestEffect()) markEditableConsumed();
  }, listenerOptions);

  if (window === window.top) {
    const runtimeMessageListener = (message, _sender, sendResponse) => {
      if (message?.type === "MJ_HEALTH_CHECK") {
        sendResponse({ ready: true });
        return;
      }
      if (message?.type === "MJ_PLAY") playWhenDocumentReady(message.reason, message.effectId);
    };
    api.runtimeMessageListener = runtimeMessageListener;
    chrome.runtime.onMessage.addListener(runtimeMessageListener);

    try {
      chrome.runtime.sendMessage({ type: "MJ_TOP_READY" }).then((response) => {
        if (response?.play) playWhenDocumentReady(response.reason, response.effectId);
      }).catch(() => {});
    } catch {
      // The active tab reinjection path will replace this invalid context.
    }
  }
})();
