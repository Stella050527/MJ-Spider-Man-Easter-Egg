(() => {
  const SEARCH_QUERY_KEYS = new Set([
    "q",
    "query",
    "wd",
    "word",
    "keyword",
    "search_query",
    "text",
    "p",
  ]);

  function hasExactMjSearchParam(params) {
    for (const [key, value] of params) {
      if (SEARCH_QUERY_KEYS.has(key.toLowerCase()) && /^\s*mj\s*$/i.test(value)) return true;
    }
    return false;
  }

  function isMjSearchUrl(rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (hasExactMjSearchParam(url.searchParams)) return true;
      const hashQuery = url.hash.includes("?") ? url.hash.slice(url.hash.indexOf("?") + 1) : "";
      return hashQuery ? hasExactMjSearchParam(new URLSearchParams(hashQuery)) : false;
    } catch {
      return false;
    }
  }

  function isAddressBarMjNavigation(details) {
    return details?.frameId === 0
      && details.transitionQualifiers?.includes("from_address_bar")
      && isMjSearchUrl(details.url);
  }

  const detector = { isAddressBarMjNavigation, isMjSearchUrl };
  globalThis.__mjNavigationDetector = detector;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = detector;
  }
})();
