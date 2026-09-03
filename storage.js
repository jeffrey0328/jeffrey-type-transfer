// @ts-check

import { DEFAULT_CONFIG } from "./app-config.js";

export const CONFIG_KEY = "yuqiao.config.v1";
export const JOB_STATE_KEY = "yuqiao.jobState.v1";
export const PAGE_SELECTION_KEY = "yuqiao.pageSelection.v1";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export async function loadConfig() {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    return { ...DEFAULT_CONFIG, ...(stored[CONFIG_KEY] ?? {}) };
  }
  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function saveConfig(config) {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function loadJobState() {
  if (!hasChromeStorage()) return null;
  const stored = await chrome.storage.local.get(JOB_STATE_KEY);
  return stored[JOB_STATE_KEY] ?? null;
}

export async function saveJobState(job) {
  if (!hasChromeStorage()) return;
  await chrome.storage.local.set({ [JOB_STATE_KEY]: job });
}

export async function loadPageSelection() {
  if (!hasChromeStorage()) return null;
  const stored = await chrome.storage.session.get(PAGE_SELECTION_KEY);
  return stored[PAGE_SELECTION_KEY] ?? null;
}

export async function savePageSelection(selection) {
  if (!hasChromeStorage()) return;
  await chrome.storage.session.set({ [PAGE_SELECTION_KEY]: selection });
}

export async function clearPageSelection() {
  if (!hasChromeStorage()) return;
  await chrome.storage.session.remove(PAGE_SELECTION_KEY);
}
