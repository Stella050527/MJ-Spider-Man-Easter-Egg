(() => {
  // User-editable settings. Reload the extension and refresh the page after changes.
  const config = {
    shortcut: {
      enabled: true,
      key: "m",
    },
    genericClearTriggerEnabled: false,
    effectAudioEnabled: true,
  };

  globalThis.__mjEasterEggConfig = config;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = config;
  }
})();
