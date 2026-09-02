// Persist editable text selections before opening the extension side panel steals focus.
(() => {
  const TOKEN_ATTRIBUTE = "data-yuqiao-selection-token";
  let lastFingerprint = "";
  let scheduled = false;

  const makeToken = () => crypto.randomUUID?.() ||
    `yuqiao-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  function deepActiveElement() {
    let active = document.activeElement;
    while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active;
  }

  function findEditable(node) {
    let element = node instanceof HTMLElement ? node : node?.parentElement;
    while (element) {
      if (element.hasAttribute("contenteditable")) {
        return element.getAttribute("contenteditable") === "false" ? null : element;
      }
      if (element.parentElement) {
        element = element.parentElement;
        continue;
      }
      const root = element.getRootNode();
      element = root instanceof ShadowRoot ? root.host : null;
    }
    return document.designMode === "on" ? document.body : null;
  }

  function nodePath(root, node) {
    const path = [];
    let current = node;
    while (current && current !== root) {
      const parent = current.parentNode;
      if (!parent) return null;
      const index = Array.prototype.indexOf.call(parent.childNodes, current);
      if (index < 0) return null;
      path.unshift(index);
      current = parent;
    }
    return current === root ? path : null;
  }

  function capture() {
    const active = deepActiveElement();
    const isTextArea = active instanceof HTMLTextAreaElement;
    const isTextInput = active instanceof HTMLInputElement && active.type !== "password" &&
      typeof active.selectionStart === "number" && typeof active.selectionEnd === "number";

    if (isTextArea || isTextInput) {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? start;
      if (end <= start) return null;
      const text = active.value.slice(start, end);
      if (!text.trim()) return null;
      const token = active.getAttribute(TOKEN_ATTRIBUTE) || makeToken();
      active.setAttribute(TOKEN_ATTRIBUTE, token);
      return { token, text, start, end, elementName: isTextArea ? "textarea" : "input" };
    }

    const pageSelection = window.getSelection();
    if (!pageSelection || pageSelection.isCollapsed || pageSelection.rangeCount === 0) return null;
    const range = pageSelection.getRangeAt(0);
    const editable = findEditable(range.commonAncestorContainer) || findEditable(active);
    if (!editable || !editable.contains(range.startContainer) ||
        !editable.contains(range.endContainer)) return null;
    const text = range.toString();
    if (!text.trim()) return null;
    const startPath = nodePath(editable, range.startContainer);
    const endPath = nodePath(editable, range.endContainer);
    if (!startPath || !endPath) return null;
    const token = editable.getAttribute(TOKEN_ATTRIBUTE) || makeToken();
    editable.setAttribute(TOKEN_ATTRIBUTE, token);
    return {
      token,
      text,
      start: range.startOffset,
      end: range.endOffset,
      elementName: "contenteditable",
      range: {
        startPath,
        startOffset: range.startOffset,
        endPath,
        endOffset: range.endOffset,
      },
    };
  }

  function publish() {
    scheduled = false;
    const selection = capture();
    if (!selection) return;
    const fingerprint = JSON.stringify(selection);
    if (fingerprint === lastFingerprint) return;
    lastFingerprint = fingerprint;
    chrome.runtime.sendMessage({
      type: "yuqiao-selection-updated",
      selection,
    }, () => void chrome.runtime.lastError);
  }

  function schedulePublish() {
    if (scheduled) return;
    scheduled = true;
    window.setTimeout(publish, 0);
  }

  for (const eventName of ["selectionchange", "select", "focusin", "pointerup", "keyup", "input"]) {
    document.addEventListener(eventName, schedulePublish, true);
  }
})();
