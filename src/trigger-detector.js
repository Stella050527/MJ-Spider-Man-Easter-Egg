(() => {
  globalThis.__mjEasterEgg = globalThis.__mjEasterEgg || {};
  if (globalThis.__mjEasterEgg.detector) return;

  const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "email", "tel"]);
  const ENGLISH_SEND_HINT = /(?:^|[\s_-])(send|submit|post|publish|reply|comment|search)(?:$|[\s_-])/i;
  const CHINESE_SEND_HINT = /(发送|提交|发布|回复|评论|搜索)/;

  function hasMjToken(text) {
    return /(?:^|\s)mj$/i.test(text);
  }

  function findEditable(path) {
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (node instanceof HTMLTextAreaElement) return node;
      if (node instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(node.type.toLowerCase())) return node;
      if (node.isContentEditable || node.getAttribute("role") === "textbox") return node;
    }
    return null;
  }

  function findSendControl(path) {
    for (const [index, node] of path.entries()) {
      if (!(node instanceof Element)) continue;
      if (node instanceof HTMLButtonElement) return node;
      if (node instanceof HTMLInputElement && ["submit", "button", "image"].includes(node.type)) return node;
      if (node.getAttribute("role") === "button") return node;
      const label = controlLabel(node);
      const hasExplicitClickSemantics = node.hasAttribute("tabindex") || node.hasAttribute("onclick");
      if (hasSendHint(label) && (index === 0 || hasExplicitClickSemantics || hasActionIdentity(node))) return node;
    }
    return null;
  }

  function findActionControl(path) {
    for (const node of path) {
      if (!(node instanceof Element)) continue;
      if (findEditable([node])) return null;
      if (node instanceof HTMLButtonElement) return node;
      if (node instanceof HTMLInputElement && ["submit", "button", "image"].includes(node.type)) return node;
      if (node.getAttribute("role") === "button") return node;
      if (node.hasAttribute("onclick") || node.hasAttribute("tabindex")) return node;
      if (getComputedStyle(node).cursor === "pointer") return node;
    }
    return null;
  }

  function hasSendHint(label) {
    return ENGLISH_SEND_HINT.test(label) || CHINESE_SEND_HINT.test(label);
  }

  function hasActionIdentity(control) {
    const identity = [control.id, control.className].filter((value) => typeof value === "string").join(" ");
    return /(?:^|[\s_-])(send|submit|post|publish)(?:$|[\s_-])/i.test(identity)
      || /(发送|提交|发布)/.test(identity);
  }

  function controlLabel(control) {
    return [
      control.getAttribute("aria-label"),
      control.getAttribute("title"),
      control.getAttribute("name"),
      control.getAttribute("value"),
      control.getAttribute("data-testid"),
      control.getAttribute("data-test"),
      control.id,
      typeof control.className === "string" ? control.className : null,
      control.textContent,
    ].filter(Boolean).join(" ").trim();
  }

  function isSendControl(control) {
    if (!control || control.matches(":disabled, [aria-disabled='true']")) return false;
    if (control instanceof HTMLInputElement && ["submit", "image"].includes(control.type)) return true;
    if (control instanceof HTMLButtonElement && (control.getAttribute("type") || "submit").toLowerCase() === "submit") {
      return true;
    }
    return hasSendHint(controlLabel(control));
  }

  function textBeforeInputCaret(element) {
    if (typeof element.selectionStart !== "number") return null;
    return element.value.slice(0, element.selectionStart);
  }

  function textBeforeDomCaret(element) {
    const selection = element.ownerDocument.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    const activeRange = selection.getRangeAt(0);
    if (!element.contains(activeRange.startContainer)) return null;

    const beforeCaret = activeRange.cloneRange();
    beforeCaret.selectNodeContents(element);
    beforeCaret.setEnd(activeRange.startContainer, activeRange.startOffset);
    return beforeCaret.toString();
  }

  function textBeforeCaret(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return textBeforeInputCaret(element);
    }
    return textBeforeDomCaret(element);
  }

  function textOfEditable(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) return element.value;
    return element.innerText || element.textContent || "";
  }

  function shouldTrigger(event, isComposing) {
    if (event.key !== "Enter" || event.isComposing || isComposing || event.keyCode === 229) return false;
    const editable = findEditable(event.composedPath());
    if (!editable) return false;
    const text = textBeforeCaret(editable);
    return typeof text === "string" && hasMjToken(text);
  }

  globalThis.__mjEasterEgg.detector = {
    findActionControl,
    findEditable,
    findSendControl,
    hasMjToken,
    isSendControl,
    shouldTrigger,
    textBeforeCaret,
    textOfEditable,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { hasMjToken };
  }
})();
