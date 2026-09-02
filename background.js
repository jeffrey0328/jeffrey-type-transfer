// @ts-check

import { APP_DISPLAY_NAME } from "./app-config.js";
import { capturePageSelection, replacePageSelection } from "./page-selection.js";
import {
  clearPageSelection,
  loadConfig,
  loadPageSelection,
  saveJobState,
  saveLastComparison,
  savePageSelection,
} from "./storage.js";
import { translateText } from "./translate.js";
import {
  NATIVE_BRIDGE_START_MESSAGE,
  startNativeBridge,
} from "./native-bridge.js";

async function resolveTabId(tabId) {
  if (typeof tabId === "number") return tabId;
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id;
}

async function openPanel(tabId) {
  await chrome.sidePanel.open({ tabId }).catch(() => undefined);
}

async function rememberSelection(tabId) {
  const selection = await capturePageSelection(tabId).catch(() => null);
  if (selection) {
    await savePageSelection(selection);
    return selection;
  }
  const saved = await loadPageSelection();
  return saved?.tabId === tabId ? saved : null;
}

async function translateAndReplace(tabId) {
  const resolvedTabId = await resolveTabId(tabId);
  if (!resolvedTabId) return;
  const selection = await rememberSelection(resolvedTabId);
  if (!selection) {
    await saveJobState({
      status: "error",
      message: "请先在网页可编辑区域中选中文字",
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
    await clearPageSelection();
    await saveLastComparison({
      ...result,
      source: selection.text,
      targetLanguage: config.targetLanguage,
      createdAt: Date.now(),
    });
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
      title: `用 ${APP_DISPLAY_NAME} 翻译并替换“%s”`,
      contexts: ["selection"],
    });
  });
  void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
});

void chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => undefined);

chrome.action.onClicked.addListener((tab) => {
  if (typeof tab.id !== "number") return;
  void rememberSelection(tab.id);
  void openPanel(tab.id);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "yuqiao-translate-selection") void translateAndReplace(tab?.id);
});

chrome.commands.onCommand.addListener((command) => {
  if (command === "translate-selection") void translateAndReplace();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === NATIVE_BRIDGE_START_MESSAGE) {
    void startNativeBridge(chrome).then(sendResponse);
    return true;
  }
  if (message?.type !== "yuqiao-selection-updated" ||
      typeof sender.tab?.id !== "number" || sender.tab.active !== true) return false;
  const selection = message.selection;
  if (!selection || typeof selection.token !== "string" ||
      typeof selection.text !== "string" || !selection.text.trim() ||
      typeof selection.start !== "number" || typeof selection.end !== "number") return false;
  void savePageSelection({
    ...selection,
    tabId: sender.tab.id,
    frameId: sender.frameId,
  });
  return false;
});
