import {
  DEFAULT_CONFIG,
  type AppConfig,
  type ComparisonRecord,
  type TranslationJobState,
} from "../types";

const CONFIG_KEY = "yuqiao.config.v1";
const LAST_COMPARISON_KEY = "yuqiao.lastComparison.v1";
const JOB_STATE_KEY = "yuqiao.jobState.v1";

const hasChromeStorage = () =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

export async function loadConfig(): Promise<AppConfig> {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(CONFIG_KEY);
    return { ...DEFAULT_CONFIG, ...(stored[CONFIG_KEY] as Partial<AppConfig> | undefined) };
  }

  const raw = localStorage.getItem(CONFIG_KEY);
  if (!raw) return DEFAULT_CONFIG;
  try {
    return { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<AppConfig>) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: AppConfig): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [CONFIG_KEY]: config });
    return;
  }
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

export async function loadLastComparison(): Promise<ComparisonRecord | null> {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(LAST_COMPARISON_KEY);
    return (stored[LAST_COMPARISON_KEY] as ComparisonRecord | undefined) ?? null;
  }
  const raw = localStorage.getItem(LAST_COMPARISON_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ComparisonRecord;
  } catch {
    return null;
  }
}

export async function loadJobState(): Promise<TranslationJobState | null> {
  if (hasChromeStorage()) {
    const stored = await chrome.storage.local.get(JOB_STATE_KEY);
    return (stored[JOB_STATE_KEY] as TranslationJobState | undefined) ?? null;
  }
  return null;
}

export async function saveJobState(state: TranslationJobState): Promise<void> {
  if (!hasChromeStorage()) return;
  await chrome.storage.local.set({ [JOB_STATE_KEY]: state });
}

export async function saveLastComparison(comparison: ComparisonRecord): Promise<void> {
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [LAST_COMPARISON_KEY]: comparison });
    return;
  }
  localStorage.setItem(LAST_COMPARISON_KEY, JSON.stringify(comparison));
}

export { CONFIG_KEY, JOB_STATE_KEY, LAST_COMPARISON_KEY };
