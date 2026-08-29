importScripts("navigation-detector.js");

const CONTENT_SCRIPT_FILES = [
  "src/config.js",
  "src/trigger-detector.js",
  "src/effect-player.js",
  "src/content.js",
];
const NAVIGATION_START_WINDOW_MS = 2500;
const NAVIGATION_COMPLETE_TIMEOUT_MS = 30000;
const pendingNavigation = new Map();
const tabNavigationActivity = new Map();

function chooseEffectId() {
  return Math.random() < 0.5 ? "hang" : "pose";
}

async function injectIntoExistingTabs() {
  const tabs = await chrome.tabs.query({});
  await Promise.allSettled(tabs.map((tab) => (
    typeof tab.id === "number" ? ensureContentInTab(tab.id) : Promise.resolve()
  )));
}

async function ensureContentInTab(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(
      tabId,
      { type: "MJ_HEALTH_CHECK" },
      { frameId: 0 },
    );
    if (response?.ready) return;
  } catch {
    // Missing or invalidated content scripts need a fresh injection.
  }
  await injectIntoTab(tabId);
}

async function injectIntoTab(tabId) {
  const target = { tabId, allFrames: true };
  await chrome.scripting.executeScript({
    target,
    func: () => {
      const current = globalThis.__mjEasterEgg;
      try {
        current?.player?.stop?.();
        current?.contentController?.abort();
        current?.backgroundPort?.disconnect();
        if (current?.runtimeMessageListener) {
          chrome.runtime.onMessage.removeListener(current.runtimeMessageListener);
        }
      } catch {
        // A reloaded extension may have already invalidated the old listener context.
      }
      delete globalThis.__mjEasterEgg;
    },
  });
  return chrome.scripting.executeScript({
    target,
    files: CONTENT_SCRIPT_FILES,
  });
}

function armNavigationReplay(tabId, sourceDocumentId, reason, effectId, navigationStarted = false) {
  const state = {
    phase: navigationStarted ? "navigating" : "armed",
    sourceDocumentId,
    reason,
    effectId,
    expiresAt: Date.now() + (navigationStarted
      ? NAVIGATION_COMPLETE_TIMEOUT_MS
      : NAVIGATION_START_WINDOW_MS),
  };
  pendingNavigation.set(tabId, state);

  setTimeout(() => {
    if (pendingNavigation.get(tabId) === state && state.phase === "armed") {
      pendingNavigation.delete(tabId);
    }
  }, NAVIGATION_START_WINDOW_MS + 100);

  setTimeout(() => {
    if (pendingNavigation.get(tabId) === state && Date.now() > state.expiresAt) {
      pendingNavigation.delete(tabId);
    }
  }, NAVIGATION_COMPLETE_TIMEOUT_MS + 200);

  return state;
}

function deliverPendingNavigation(tabId, state) {
  if (pendingNavigation.get(tabId) !== state || Date.now() > state.expiresAt) {
    pendingNavigation.delete(tabId);
    return;
  }

  chrome.tabs.sendMessage(
    tabId,
    { type: "MJ_PLAY", reason: state.reason, effectId: state.effectId },
    { frameId: 0 },
  ).then(() => {
    if (pendingNavigation.get(tabId) === state) pendingNavigation.delete(tabId);
  }).catch(() => {
    // Keep the state for the destination document's ready handshake.
  });
}

function handleTrigger(message, sender, trustSenderTabState = true) {
  if (typeof sender.tab?.id !== "number") return;

  const reason = message.reason === "chord" ? "chord" : "text";
  const effectId = message.effectId === "pose" ? "pose" : "hang";
  const triggeredAt = Number.isFinite(message.triggeredAt) ? message.triggeredAt : Date.now();
  const activity = tabNavigationActivity.get(sender.tab.id);
  const activityBelongsToTrigger = Boolean(
    activity
    && activity.startedAt >= triggeredAt
    && Date.now() - activity.startedAt <= NAVIGATION_START_WINDOW_MS,
  );
  const senderUrlChanged = trustSenderTabState
    && Boolean(sender.url && sender.tab.url && sender.url !== sender.tab.url);
  const navigationStarted = activityBelongsToTrigger
    || (trustSenderTabState && sender.tab.status === "loading")
    || senderUrlChanged;
  const state = armNavigationReplay(
    sender.tab.id,
    sender.documentId,
    reason,
    effectId,
    navigationStarted,
  );

  if (activityBelongsToTrigger && activity.status === "complete") {
    deliverPendingNavigation(sender.tab.id, state);
  }

  if (sender.frameId === 0) return;
  chrome.tabs.sendMessage(
    sender.tab.id,
    { type: "MJ_PLAY", reason, effectId },
    { frameId: 0 },
  ).catch(() => {
    // The top frame may have navigated between the input event and delivery.
  });
}

chrome.runtime.onInstalled.addListener(() => {
  injectIntoExistingTabs().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  injectIntoExistingTabs().catch(() => {});
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  ensureContentInTab(tabId).catch(() => {});
});

injectIntoExistingTabs().catch(() => {});

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== "mj-easter-egg" || typeof port.sender?.tab?.id !== "number") return;
  port.onMessage.addListener((message) => {
    if (message?.type === "MJ_TRIGGER") handleTrigger(message, port.sender, false);
  });
});

chrome.webNavigation.onCommitted.addListener((details) => {
  if (!globalThis.__mjNavigationDetector.isAddressBarMjNavigation(details)) return;
  armNavigationReplay(details.tabId, null, "omnibox", chooseEffectId(), true);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (typeof sender.tab?.id !== "number") return;

  if (message?.type === "MJ_TOP_READY" && sender.frameId === 0) {
    const state = pendingNavigation.get(sender.tab.id);
    const hasDocumentIds = Boolean(state?.sourceDocumentId && sender.documentId);
    const isNewDocument = state && (hasDocumentIds
      ? sender.documentId !== state.sourceDocumentId
      : state.phase === "navigating");
    const shouldPlay = Boolean(isNewDocument && Date.now() <= state.expiresAt);
    if (isNewDocument) pendingNavigation.delete(sender.tab.id);
    sendResponse({ play: shouldPlay, reason: state?.reason, effectId: state?.effectId });
    return;
  }

  if (message?.type === "MJ_TRIGGER") handleTrigger(message, sender);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  const now = Date.now();
  if (changeInfo.status === "loading") {
    tabNavigationActivity.set(tabId, { status: "loading", startedAt: now });
  } else if (changeInfo.status === "complete") {
    const activity = tabNavigationActivity.get(tabId);
    tabNavigationActivity.set(tabId, {
      status: "complete",
      startedAt: activity?.startedAt || now,
    });
  }

  const state = pendingNavigation.get(tabId);
  if (!state) return;

  if (state.phase === "armed" && changeInfo.status === "loading") {
    if (Date.now() > state.expiresAt) {
      pendingNavigation.delete(tabId);
      return;
    }
    state.phase = "navigating";
    state.expiresAt = Date.now() + NAVIGATION_COMPLETE_TIMEOUT_MS;
    return;
  }

  if (state.phase !== "navigating" || changeInfo.status !== "complete") return;
  deliverPendingNavigation(tabId, state);
});

chrome.tabs.onRemoved.addListener((tabId) => {
  pendingNavigation.delete(tabId);
  tabNavigationActivity.delete(tabId);
});
