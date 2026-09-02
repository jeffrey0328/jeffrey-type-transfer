import { capturePageSelection, replacePageSelection } from "./lib/pageSelection";
import { loadConfig, saveJobState, saveLastComparison } from "./lib/storage";
import { translateText } from "./lib/translate";
import type { ComparisonRecord } from "./types";

async function resolveTabId(tabId?: number) {
  if (typeof tabId === "number") return tabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

async function openPanel(tabId: number) {
  await chrome.sidePanel.open({ tabId }).catch(() => undefined);
}

async function translateAndReplace(tabId?: number) {
  const resolvedTabId = await resolveTabId(tabId);
  if (!resolvedTabId) return;

  const selection = await capturePageSelection(resolvedTabId).catch(() => null);
  if (!selection) {
    await saveJobState({
      status: "error",
      message: "请先在网页输入框中选中文字",
      createdAt: Date.now(),
    });
    await openPanel(resolvedTabId);
    return;
  }

  await saveJobState({
    status: "running",
    message: "正在翻译并准备替换选区…",
    source: selection.text,
    createdAt: Date.now(),
  });
  await openPanel(resolvedTabId);

  try {
    const config = await loadConfig();
    const result = await translateText(config, {
      text: selection.text,
      sourceLanguage: "auto",
      targetLanguage: config.targetLanguage,
      tone: config.tone,
    });
    await replacePageSelection(selection, result.translation, resolvedTabId);
    const comparison: ComparisonRecord = {
      ...result,
      source: selection.text,
      targetLanguage: config.targetLanguage,
      createdAt: Date.now(),
    };
    await saveLastComparison(comparison);
    await saveJobState({
      status: "success",
      message: `已通过 ${result.provider} 翻译并替换页面选区`,
      createdAt: Date.now(),
    });
  } catch (error) {
    await saveJobState({
      status: "error",
      message: error instanceof Error ? error.message : "翻译失败，请检查连接设置",
      source: selection.text,
      createdAt: Date.now(),
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "yuqiao-translate-selection",
      title: "用 jeffrey-type-transfer 翻译并替换“%s”",
      contexts: ["selection"],
    });
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
});

chrome.contextMenus.onClicked.addListener((
  info: { menuItemId: string | number },
  tab?: { id?: number },
) => {
  if (info.menuItemId === "yuqiao-translate-selection") {
    void translateAndReplace(tab?.id);
  }
});

chrome.commands.onCommand.addListener((command: string) => {
  if (command === "translate-selection") void translateAndReplace();
});
