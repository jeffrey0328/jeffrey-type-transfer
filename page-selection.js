// @ts-check

export function captureInputSelectionInPage() {
  const makeToken = () => crypto.randomUUID?.() ||
    `yuqiao-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  let active = document.activeElement;
  while (active instanceof HTMLElement && active.shadowRoot?.activeElement) {
    active = active.shadowRoot.activeElement;
  }

  const isTextArea = active instanceof HTMLTextAreaElement;
  const isTextInput = active instanceof HTMLInputElement && active.type !== "password" &&
    typeof active.selectionStart === "number" && typeof active.selectionEnd === "number";
  if (isTextArea || isTextInput) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? start;
    if (end <= start) return null;
    const text = active.value.slice(start, end);
    if (!text.trim()) return null;
    const token = active.dataset.yuqiaoSelectionToken || makeToken();
    active.dataset.yuqiaoSelectionToken = token;
    return {
      token,
      text,
      start,
      end,
      elementName: isTextArea ? "textarea" : "input",
    };
  }

  const selected = window.getSelection();
  if (!selected || selected.isCollapsed || selected.rangeCount === 0) return null;
  const selectedRange = selected.getRangeAt(0);
  const findEditable = (node) => {
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
  };
  const editable = findEditable(selectedRange.commonAncestorContainer) || findEditable(active);
  if (!editable || !editable.contains(selectedRange.startContainer) ||
      !editable.contains(selectedRange.endContainer)) return null;
  const text = selectedRange.toString();
  if (!text.trim()) return null;

  const nodePath = (root, node) => {
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
  };
  const startPath = nodePath(editable, selectedRange.startContainer);
  const endPath = nodePath(editable, selectedRange.endContainer);
  if (!startPath || !endPath) return null;

  const token = editable.dataset.yuqiaoSelectionToken || makeToken();
  editable.dataset.yuqiaoSelectionToken = token;
  return {
    token,
    text,
    start: selectedRange.startOffset,
    end: selectedRange.endOffset,
    elementName: "contenteditable",
    range: {
      startPath,
      startOffset: selectedRange.startOffset,
      endPath,
      endOffset: selectedRange.endOffset,
    },
  };
}

export function replaceInputSelectionInPage(args) {
  const { selection, replacement } = args;
  const selector = `[data-yuqiao-selection-token="${CSS.escape(selection.token)}"]`;
  const findElement = (root) => {
    const direct = root.querySelector(selector);
    if (direct) return direct;
    for (const candidate of root.querySelectorAll("*")) {
      if (!candidate.shadowRoot) continue;
      const nested = findElement(candidate.shadowRoot);
      if (nested) return nested;
    }
    return null;
  };
  const element = findElement(document);
  if (!(element instanceof HTMLElement)) {
    return { ok: false, error: "原输入框已失去连接，请重新选择文字" };
  }

  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.value.slice(selection.start, selection.end) !== selection.text) {
      return { ok: false, error: "原文已经变化，请重新选择后再翻译" };
    }
    element.focus();
    const nextValue = element.value.slice(0, selection.start) + replacement +
      element.value.slice(selection.end);
    const ownSetter = Object.getOwnPropertyDescriptor(element, "value")?.set;
    const prototypeSetter = Object.getOwnPropertyDescriptor(
      element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      "value",
    )?.set;
    if (prototypeSetter && prototypeSetter !== ownSetter) prototypeSetter.call(element, nextValue);
    else if (ownSetter) ownSetter.call(element, nextValue);
    else element.value = nextValue;
    const caret = selection.start + replacement.length;
    element.setSelectionRange(caret, caret);
  } else {
    if (selection.elementName !== "contenteditable" || !selection.range) {
      return { ok: false, error: "原输入框类型已经变化，请重新选择文字" };
    }
    const resolveNode = (root, path) => {
      let current = root;
      for (const index of path) current = current?.childNodes[index];
      return current;
    };
    const startNode = resolveNode(element, selection.range.startPath);
    const endNode = resolveNode(element, selection.range.endPath);
    if (!startNode || !endNode) {
      return { ok: false, error: "编辑器内容已经变化，请重新选择文字" };
    }
    const range = document.createRange();
    try {
      range.setStart(startNode, selection.range.startOffset);
      range.setEnd(endNode, selection.range.endOffset);
    } catch {
      return { ok: false, error: "编辑器选区已经变化，请重新选择文字" };
    }
    if (range.toString() !== selection.text) {
      return { ok: false, error: "原文已经变化，请重新选择后再翻译" };
    }
    element.focus();
    const pageSelection = window.getSelection();
    pageSelection?.removeAllRanges();
    pageSelection?.addRange(range);
    const insertedByBrowser = typeof document.execCommand === "function" &&
      document.execCommand("insertText", false, replacement);
    if (!insertedByBrowser) {
      range.deleteContents();
      const inserted = document.createTextNode(replacement);
      range.insertNode(inserted);
      range.setStartAfter(inserted);
      range.collapse(true);
      pageSelection?.removeAllRanges();
      pageSelection?.addRange(range);
    }
  }

  element.dispatchEvent(new InputEvent("input", {
    bubbles: true,
    composed: true,
    data: replacement,
    inputType: "insertReplacementText",
  }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  delete element.dataset.yuqiaoSelectionToken;
  return { ok: true };
}

export async function capturePageSelection(tabId) {
  if (typeof chrome === "undefined" || !chrome.scripting) return null;
  let resolvedTabId = tabId;
  if (!resolvedTabId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    resolvedTabId = tab?.id;
  }
  if (!resolvedTabId) return null;

  let results;
  try {
    results = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId, allFrames: true },
      func: captureInputSelectionInPage,
    });
  } catch {
    results = await chrome.scripting.executeScript({
      target: { tabId: resolvedTabId },
      func: captureInputSelectionInPage,
    });
  }
  const capturedEntry = results.find((entry) => entry.result);
  if (!capturedEntry?.result) return null;
  return { ...capturedEntry.result, tabId: resolvedTabId, frameId: capturedEntry.frameId };
}

export async function replacePageSelection(selection, replacement, tabId) {
  if (typeof chrome === "undefined" || !chrome.scripting) return;
  let resolvedTabId = tabId ?? selection.tabId;
  if (!resolvedTabId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    resolvedTabId = tab?.id;
  }
  if (!resolvedTabId) throw new Error("没有可操作的活动页面");
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: typeof selection.frameId === "number"
      ? { tabId: resolvedTabId, frameIds: [selection.frameId] }
      : { tabId: resolvedTabId },
    args: [{ selection, replacement }],
    func: replaceInputSelectionInPage,
  });
  if (!result?.ok) throw new Error(result?.error || "无法替换页面选区");
}
