import type { PageSelection } from "../types";

export function captureInputSelectionInPage(): PageSelection | null {
  const active = document.activeElement;
  const isTextArea = active instanceof HTMLTextAreaElement;
  const isTextInput =
    active instanceof HTMLInputElement &&
    ["text", "search", "url", "tel", "email"].includes(active.type);
  if (!isTextArea && !isTextInput) return null;

  const input = active as HTMLInputElement | HTMLTextAreaElement;
  const start = input.selectionStart ?? 0;
  const end = input.selectionEnd ?? start;
  if (end <= start) return null;
  const text = input.value.slice(start, end);
  if (!text.trim()) return null;

  const token = input.dataset.yuqiaoSelectionToken || crypto.randomUUID();
  input.dataset.yuqiaoSelectionToken = token;
  return {
    token,
    text,
    start,
    end,
    elementName: isTextArea ? "textarea" : "input",
  };
}

export function replaceInputSelectionInPage(args: {
  selection: PageSelection;
  replacement: string;
}): { ok: boolean; error?: string } {
  const { selection, replacement } = args;
  const selector = `[data-yuqiao-selection-token="${CSS.escape(selection.token)}"]`;
  const element = document.querySelector(selector);
  if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
    return { ok: false, error: "原输入框已失去连接，请重新选择文字" };
  }
  if (element.value.slice(selection.start, selection.end) !== selection.text) {
    return { ok: false, error: "原文已经变化，请重新选择后再翻译" };
  }

  element.focus();
  element.setSelectionRange(selection.start, selection.end);
  element.setRangeText(replacement, selection.start, selection.end, "end");
  element.dispatchEvent(
    new InputEvent("input", {
      bubbles: true,
      composed: true,
      data: replacement,
      inputType: "insertReplacementText",
    }),
  );
  element.dispatchEvent(new Event("change", { bubbles: true }));
  delete element.dataset.yuqiaoSelectionToken;
  return { ok: true };
}

export async function capturePageSelection(tabId?: number): Promise<PageSelection | null> {
  if (typeof chrome === "undefined" || !chrome.scripting) return null;
  let resolvedTabId = tabId;
  if (!resolvedTabId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    resolvedTabId = tab?.id;
  }
  if (!resolvedTabId) return null;
  const [{ result = null } = {}] = await chrome.scripting.executeScript({
    target: { tabId: resolvedTabId },
    func: captureInputSelectionInPage,
  });
  return result;
}

export async function replacePageSelection(
  selection: PageSelection,
  replacement: string,
  tabId?: number,
): Promise<void> {
  if (typeof chrome === "undefined" || !chrome.scripting) return;
  let resolvedTabId = tabId;
  if (!resolvedTabId) {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    resolvedTabId = tab?.id;
  }
  if (!resolvedTabId) throw new Error("没有可操作的活动页面");
  const [{ result } = {}] = await chrome.scripting.executeScript({
    target: { tabId: resolvedTabId },
    args: [{ selection, replacement }],
    func: replaceInputSelectionInPage,
  });
  if (!result?.ok) throw new Error(result?.error || "无法替换页面选区");
}
