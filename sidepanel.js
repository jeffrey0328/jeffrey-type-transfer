// @ts-check

import {
  APP_DISPLAY_NAME,
  CLI_GUIDES,
  CLI_PROVIDERS,
  DEFAULT_CONFIG,
  LANGUAGES,
  getCliProviderMeta,
} from "./app-config.js";
import { capturePageSelection, replacePageSelection } from "./page-selection.js";
import {
  JOB_STATE_KEY,
  PAGE_SELECTION_KEY,
  clearPageSelection,
  loadConfig,
  loadJobState,
  loadPageSelection,
  saveConfig,
  savePageSelection,
} from "./storage.js";
import { checkApiConnection, checkBridge, translateText } from "./translate.js";
import { NATIVE_BRIDGE_START_MESSAGE } from "./native-bridge.js";

const root = document.querySelector("#root");
const extensionRuntime =
  typeof chrome !== "undefined" && Boolean(chrome.scripting && chrome.storage?.local);
const previewEmpty =
  !extensionRuntime && new URLSearchParams(window.location.search).has("empty");
const previewConnectionState =
  !extensionRuntime ? new URLSearchParams(window.location.search).get("connection") : null;

const DEMO_SOURCE = "把想法带到任何语言里，让沟通更自然。";
const DEMO_SELECTION = {
  token: "preview-selection",
  text: DEMO_SOURCE,
  start: 0,
  end: DEMO_SOURCE.length,
  elementName: "textarea",
};
const state = {
  view: "translator",
  config: { ...DEFAULT_CONFIG },
  draft: { ...DEFAULT_CONFIG },
  bridgeConnected: false,
  bridgeReachable: false,
  bridgeMessage: "",
  bridgeCheckKey: "",
  apiConnected: false,
  apiCheckKey: "",
  apiMessage: "",
  pageSelection: extensionRuntime || previewEmpty ? null : DEMO_SELECTION,
  jobState: null,
  isPending: false,
  guideTab: "text",
  advancedOpen: false,
  checking: false,
  saving: false,
  bridgeStarting: false,
  nativeSetupOpen: false,
  notice: "",
  copied: "",
  transitioning: false,
};

const GLYPHS = {
  settings: "⚙",
  scan: "⌗",
  refresh: "↻",
  check: "✓",
  pointer: "⌁",
  sparkle: "✦",
  terminal: ">_",
  key: "◆",
  server: "◎",
  code: "</>",
  shield: "◇",
  copy: "⧉",
  save: "✓",
  back: "←",
  close: "×",
  chevron: "⌄",
  external: "↗",
  play: "▶",
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name, className = "") {
  return `<span class="ui-icon ${className}" aria-hidden="true">${escapeHtml(GLYPHS[name] ?? "•")}</span>`;
}

function optionMarkup(items, selected) {
  return items.map((item) =>
    `<option value="${escapeHtml(item.value)}" ${item.value === selected ? "selected" : ""}>${escapeHtml(item.label)}</option>`,
  ).join("");
}

function cliConnectionKey(config) {
  return `${String(config.bridgeUrl).trim()}\n${config.cliProvider}`;
}

function apiConnectionKey(config) {
  return `${String(config.apiBaseUrl).trim()}\n${String(config.apiModel).trim()}\n${String(config.apiKey).trim()}`;
}

function isConnectionReady(config = state.config) {
  if (config.mode === "api") {
    return state.apiConnected && state.apiCheckKey === apiConnectionKey(config);
  }
  return state.bridgeConnected && state.bridgeCheckKey === cliConnectionKey(config);
}

function connectionGateMessage(config = state.config) {
  if (config.mode === "api") {
    return state.apiMessage || "请完整填写 API 配置并点击“保存并检测”。";
  }
  return state.bridgeMessage || `请先启动桥接并确认 ${getCliProviderMeta(config.cliProvider).shortLabel} 已就绪。`;
}

async function switchView(nextView) {
  if (state.transitioning || nextView === state.view) return;
  if (nextView === "translator" && !isConnectionReady()) {
    state.notice = connectionGateMessage();
    renderSettings();
    return;
  }
  state.transitioning = true;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const outgoing = root.querySelector(".app-shell");
  const exitX = nextView === "settings" ? -56 : 56;
  if (outgoing && !reduceMotion) {
    await outgoing.animate(
      [
        { opacity: 1, transform: "translateX(0) scale(1)" },
        { opacity: 0, transform: `translateX(${exitX}px) scale(0.985)` },
      ],
      { duration: 150, easing: "cubic-bezier(.4, 0, 1, 1)", fill: "forwards" },
    ).finished.catch(() => undefined);
  }
  state.view = nextView;
  if (nextView === "settings") renderSettings();
  else renderTranslator();
  const incoming = root.querySelector(".app-shell");
  if (incoming && !reduceMotion) {
    await incoming.animate(
      [
        { opacity: 0, transform: `translateX(${-exitX}px) scale(0.985)` },
        { opacity: 1, transform: "translateX(0) scale(1)" },
      ],
      { duration: 220, easing: "cubic-bezier(.16, 1, .3, 1)" },
    ).finished.catch(() => undefined);
  }
  state.transitioning = false;
}

function renderTranslator() {
  const config = state.config;
  const provider = getCliProviderMeta(config.cliProvider);
  const connected = isConnectionReady(config);
  const connectionLabel = config.mode === "api"
    ? (config.apiKey ? `API · ${config.apiModel}` : "API Key · 待配置")
    : `${provider.shortLabel} · ${connected ? "已连接" : "未连接"}`;
  const selection = state.pageSelection;
  const optionControlsDisabled = state.isPending;
  const translateDisabled = !selection || state.isPending;
  const selectionMarkup = selection
    ? `<div class="selection-card is-active">
        <div class="selection-meta">
          <span>${icon("check")}已锁定选区</span>
          <span>${selection.text.length.toLocaleString()} 个字符</span>
        </div>
        <blockquote>${escapeHtml(selection.text)}</blockquote>
      </div>`
    : `<div class="selection-card is-empty">
        ${icon("pointer")}
        <div><strong>尚未选中可翻译的文字</strong><p>请先在网页输入框、文本框或可编辑区域中拖选文字。</p></div>
      </div>`;
  const jobMessage = state.jobState?.message || "选区发生变化时，目标语言与翻译按钮会自动切换状态。";

  root.innerHTML = `<main class="app-shell translator-shell">
    <header class="app-header">
      <div>
        <h1 class="brand-mark">${APP_DISPLAY_NAME}</h1>
        <button class="connection-status" id="open-settings-status">
          <span class="status-dot ${connected ? "is-online" : "is-offline"}"></span>${escapeHtml(connectionLabel)}
        </button>
      </div>
      <button class="icon-button" id="open-settings" aria-label="打开连接与设置">${icon("settings")}</button>
    </header>

    <section class="workflow-section" aria-labelledby="selection-heading">
      <div class="section-heading">
        <span class="section-heading-icon">${icon("scan")}</span>
        <div><span>页面编辑区</span><h2 id="selection-heading">当前选区</h2></div>
        <button class="refresh-selection" id="refresh-selection" aria-label="重新读取页面选区">${icon("refresh")}重新读取</button>
      </div>
      ${selectionMarkup}
      <div class="selection-controls">
        <label><span>目标语言</span><select id="target-language" ${optionControlsDisabled ? "disabled" : ""}>${optionMarkup(LANGUAGES, config.targetLanguage)}</select></label>
        <label><span>语气</span><select id="tone" ${optionControlsDisabled ? "disabled" : ""}>${optionMarkup(["自然", "正式", "简洁", "口语"].map((value) => ({ value, label: value })), config.tone)}</select></label>
      </div>
      <button class="primary-button translate-replace-button" id="translate" ${translateDisabled ? "disabled" : ""}>
          ${icon(state.isPending ? "refresh" : "sparkle", state.isPending ? "spin" : "")}
          ${state.isPending ? "正在翻译并替换…" : "翻译并替换选中内容"}
        </button>
        <div class="shortcut-row"><span>也可以直接按</span><kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>T</kbd></div>
      <div class="inline-message ${state.jobState?.status === "error" ? "is-error" : ""}" aria-live="polite">${escapeHtml(jobMessage)}</div>
    </section>
  </main>`;
  attachTranslatorEvents();
}

function attachTranslatorEvents() {
  document.querySelector("#open-settings")?.addEventListener("click", openSettings);
  document.querySelector("#open-settings-status")?.addEventListener("click", openSettings);
  document.querySelector("#refresh-selection")?.addEventListener("click", () => void refreshSelection());
  document.querySelector("#translate")?.addEventListener("click", () => void handleTranslate());
  document.querySelector("#target-language")?.addEventListener("change", (event) => {
    state.config.targetLanguage = event.target.value;
    void saveConfig(state.config);
  });
  document.querySelector("#tone")?.addEventListener("change", (event) => {
    state.config.tone = event.target.value;
    void saveConfig(state.config);
  });
}

async function refreshSelection() {
  if (!extensionRuntime) {
    state.pageSelection = previewEmpty ? null : DEMO_SELECTION;
    if (state.view === "translator") renderTranslator();
    return;
  }
  const captured = await capturePageSelection().catch(() => null);
  if (!captured) return;
  const current = state.pageSelection;
  const changed = !current || current.token !== captured.token || current.text !== captured.text ||
    current.start !== captured.start || current.end !== captured.end;
  if (!changed) return;
  state.pageSelection = captured;
  await savePageSelection(captured);
  if (state.view === "translator") renderTranslator();
}

async function handleTranslate() {
  const selection = state.pageSelection;
  if (!selection) return;
  if (state.config.mode === "cli" && !state.bridgeConnected && extensionRuntime) {
    state.jobState = {
      status: "error",
      message: `${getCliProviderMeta(state.config.cliProvider).shortLabel} 尚未连接，请先打开设置完成配置并检测连接`,
      createdAt: Date.now(),
    };
    renderTranslator();
    return;
  }
  if (state.config.mode === "api" && (!state.config.apiKey.trim() || !state.config.apiModel.trim())) {
    state.jobState = { status: "error", message: "API Key 模式尚未配置完成，请先打开连接设置", createdAt: Date.now() };
    renderTranslator();
    return;
  }
  state.isPending = true;
  state.jobState = { status: "running", message: "正在翻译并准备替换选区…", createdAt: Date.now() };
  renderTranslator();
  try {
    const result = extensionRuntime
      ? await translateText(state.config, {
          text: selection.text,
          sourceLanguage: "auto",
          targetLanguage: state.config.targetLanguage,
          tone: state.config.tone,
        })
      : {
          translation: "Carry your ideas into any language, and make communication feel natural.",
          provider: "Codex CLI",
        };
    await replacePageSelection(selection, result.translation);
    if (extensionRuntime) await clearPageSelection();
    state.pageSelection = extensionRuntime ? null : DEMO_SELECTION;
    state.jobState = { status: "success", message: `已通过 ${result.provider} 翻译并替换页面选区`, createdAt: Date.now() };
  } catch (error) {
    state.jobState = { status: "error", message: error instanceof Error ? error.message : "翻译失败，请检查连接设置", createdAt: Date.now() };
  } finally {
    state.isPending = false;
    renderTranslator();
  }
}

function openSettings() {
  state.draft = { ...state.config };
  state.notice = "";
  void switchView("settings");
}

function renderSettings() {
  const draft = state.draft;
  const mode = draft.mode;
  const provider = getCliProviderMeta(draft.cliProvider);
  const guide = CLI_GUIDES[draft.cliProvider];
  const advancedVisible = state.advancedOpen || draft.cliProvider === "ollama";
  const connectionSection = mode === "cli" ? renderCliSettings(draft, provider, guide, advancedVisible) : renderApiSettings(draft);
  const guideContent = state.guideTab === "agent"
    ? `<div class="agent-prompt-panel">
        <div class="agent-prompt-heading"><div>${icon("code")}<span>把下面提示词交给你的编码 Agent</span></div>
        <button id="copy-agent">${icon(state.copied === "agent" ? "check" : "copy")}${state.copied === "agent" ? "已复制" : "复制提示词"}</button></div>
        <pre>${escapeHtml(getAgentPrompt(mode, draft))}</pre>
      </div>`
    : mode === "cli" ? renderGuideSteps(guide.steps) : renderApiGuide();
  const noticeError = ["失败", "无法", "未", "请"].some((word) => state.notice.includes(word));
  const translatorReady = isConnectionReady();
  const gateMessage = connectionGateMessage(draft);

  root.innerHTML = `<main class="app-shell settings-shell">
    <header class="settings-header">
      <button class="icon-button back-settings" aria-label="返回翻译" ${translatorReady ? "" : "disabled"}>${icon("back")}</button>
      <h1>连接与设置</h1>
      <button class="icon-button back-settings" aria-label="关闭设置" ${translatorReady ? "" : "disabled"}>${icon("close")}</button>
    </header>
    ${translatorReady ? "" : `<div class="connection-gate-banner" role="status">${icon("shield")}<div><strong>请先完成 AI 连接</strong><span>${escapeHtml(gateMessage)}</span></div></div>`}
    <div class="mode-switch" role="tablist" aria-label="模型连接方式">
      <button role="tab" aria-selected="${mode === "cli"}" class="${mode === "cli" ? "is-active" : ""}" data-mode="cli">${icon("terminal")}本地 CLI<span class="recommended-tag">默认</span></button>
      <button role="tab" aria-selected="${mode === "api"}" class="${mode === "api" ? "is-active" : ""}" data-mode="api">${icon("key")}API Key</button>
    </div>
    ${connectionSection}
    <section class="guide-section" aria-labelledby="guide-heading">
      <div class="guide-tabs" role="tablist" aria-label="配置引导形式">
        <button role="tab" aria-selected="${state.guideTab === "text"}" class="${state.guideTab === "text" ? "is-active" : ""}" data-guide="text">文字说明</button>
        <button role="tab" aria-selected="${state.guideTab === "agent"}" class="${state.guideTab === "agent" ? "is-active" : ""}" data-guide="agent">Agent 提示词</button>
      </div>
      <h2 id="guide-heading" class="sr-only">配置引导</h2>${guideContent}
    </section>
    <div class="settings-actions">
      <button class="primary-button" id="save-settings" ${state.saving ? "disabled" : ""}>${icon(state.saving ? "refresh" : "save", state.saving ? "spin" : "")}${state.saving ? "正在检测" : "保存并检测"}</button>
      <button class="text-link-button back-settings" ${translatorReady ? "" : "disabled"}>${translatorReady ? `返回翻译 ${icon("external")}` : "连接成功后即可返回翻译"}</button>
    </div>
    <div class="settings-notice ${noticeError ? "is-error" : ""}" aria-live="polite">${escapeHtml(state.notice || "API Key 模式完全可选；默认仍推荐 Codex CLI。")}</div>
  </main>`;
  attachSettingsEvents();
}

function renderCliSettings(draft, provider, guide, advancedVisible) {
  const providerOptions = CLI_PROVIDERS.map((item) => ({
    value: item.value,
    label: `${item.label} · ${item.authLabel}`,
  }));
  const modelLabel = draft.cliProvider === "ollama"
    ? "Ollama 模型名称（必填，按 ollama ls 原样填写）"
    : "模型名称（留空则使用当前 CLI 默认模型）";
  const placeholders = {
    ollama: "按 ollama ls 的输出原样填写",
    codex: "例如：gpt-5.6-codex",
    claude: "例如：sonnet",
    glm: "例如：GLM-4.7",
  };
  const nativeStartSupported = isDefaultBridgeUrl(draft.bridgeUrl);
  const extensionId = extensionRuntime ? chrome.runtime.id : "<扩展 ID>";
  const installCommand = `powershell -ExecutionPolicy Bypass -File .\\native-host\\install.ps1 -ExtensionId ${extensionId} -Browser Both`;
  const bridgeStateClass = state.bridgeConnected
    ? "is-online"
    : state.bridgeReachable ? "is-warning" : "is-offline";
  const bridgeStateLabel = state.bridgeConnected
    ? "已就绪"
    : state.bridgeReachable ? "桥接在线" : "未连接";
  return `<section class="connection-section" aria-labelledby="cli-status-heading">
    <div class="section-title-row"><div><span class="section-icon">${icon("terminal")}</span><h2 id="cli-status-heading">${escapeHtml(provider.label)}</h2></div>
      <span class="connection-label ${bridgeStateClass}"><span class="status-dot"></span>${bridgeStateLabel}</span></div>
    <label class="form-field cli-provider-field"><span>CLI / 模型服务</span><select id="cli-provider">${optionMarkup(providerOptions, draft.cliProvider)}</select><small class="provider-summary">${escapeHtml(guide.summary)}</small></label>
    <label class="form-field"><span>本地桥接地址</span><div class="inline-input-button"><input id="bridge-url" value="${escapeHtml(draft.bridgeUrl)}" spellcheck="false" />
      <button class="secondary-button" id="check-bridge" ${state.checking ? "disabled" : ""}>${icon(state.checking ? "refresh" : "server", state.checking ? "spin" : "")}${state.checking ? "检测中" : "检测连接"}</button></div></label>
    <div class="native-bridge-launcher">
      <div class="native-bridge-heading"><div><strong>本机桥接助手</strong><span>无需保持终端窗口</span></div>
        <button class="secondary-button native-start-button" id="start-native-bridge" ${!extensionRuntime || !nativeStartSupported || state.bridgeStarting || state.bridgeReachable ? "disabled" : ""}>
          ${icon(state.bridgeStarting ? "refresh" : state.bridgeReachable ? "check" : "play", state.bridgeStarting ? "spin" : "")}
          ${state.bridgeStarting ? "正在启动" : state.bridgeReachable ? "桥接已运行" : extensionRuntime ? "一键启动" : "需在扩展中使用"}
        </button>
      </div>
      ${state.bridgeMessage ? `<p class="native-bridge-result ${state.bridgeConnected ? "is-success" : state.bridgeReachable ? "is-warning" : "is-error"}">${escapeHtml(state.bridgeMessage)}</p>` : ""}
      <details class="native-setup-details" ${state.nativeSetupOpen ? "open" : ""}><summary>首次使用：注册 Native Messaging</summary>
        <p>在项目根目录运行一次下面的命令；它只注册当前扩展 ID，不需要管理员权限。</p>
        <div class="command-block"><code>${escapeHtml(installCommand)}</code><button class="icon-button" id="copy-native-install" aria-label="复制 Native Messaging 注册命令">${icon(state.copied === "native-install" ? "check" : "copy")}</button></div>
      </details>
      ${nativeStartSupported ? "" : `<p class="native-bridge-warning">一键启动仅支持固定地址 http://127.0.0.1:8989。</p>`}
    </div>
    ${draft.cliProvider !== "ollama" ? `<button class="advanced-toggle" id="advanced-toggle">${icon("code")}高级设置${icon("chevron", state.advancedOpen ? "is-rotated" : "")}</button>` : ""}
    ${advancedVisible ? `<label class="form-field advanced-field"><span>${modelLabel}</span><input id="cli-model" value="${escapeHtml(draft.cliModel)}" placeholder="${escapeHtml(placeholders[draft.cliProvider] || "留空使用 CLI 默认模型")}" /></label>` : ""}
  </section>`;
}

function isDefaultBridgeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" && url.hostname === "127.0.0.1" &&
      url.port === "8989" && (url.pathname === "/" || url.pathname === "");
  } catch {
    return false;
  }
}

function renderApiSettings(draft) {
  const configured = Boolean(draft.apiBaseUrl.trim() && draft.apiModel.trim() && draft.apiKey.trim());
  const connected = state.apiConnected && state.apiCheckKey === apiConnectionKey(draft);
  const statusClass = connected ? "is-online" : "is-offline";
  const statusLabel = connected ? "已连接" : configured ? "待检测" : "未配置";
  return `<section class="connection-section" aria-labelledby="api-status-heading">
    <div class="section-title-row"><div><span class="section-icon">${icon("key")}</span><h2 id="api-status-heading">API Key 连接</h2></div>
      <span class="connection-label ${statusClass}"><span class="status-dot"></span>${statusLabel}</span></div>
    <div class="api-fields">
      <label class="form-field"><span>API Base URL</span><input id="api-base-url" value="${escapeHtml(draft.apiBaseUrl)}" placeholder="https://api.openai.com/v1" spellcheck="false" /></label>
      <div class="two-column-fields">
        <label class="form-field"><span>API 协议</span><select id="api-protocol">${optionMarkup([{ value: "responses", label: "Responses API" }, { value: "chat-completions", label: "Chat Completions" }], draft.apiProtocol)}</select></label>
        <label class="form-field"><span>模型名称</span><input id="api-model" value="${escapeHtml(draft.apiModel)}" placeholder="gpt-5-mini" /></label>
      </div>
      <label class="form-field"><span>API Key</span><input id="api-key" type="password" value="${escapeHtml(draft.apiKey)}" autocomplete="off" placeholder="只保存在当前浏览器配置中" /></label>
      <p class="security-note">${icon("shield")}Key 不会进入项目代码，但浏览器本地存储并非专业密钥保险库；只在受信任的个人设备上使用。</p>
    </div>
  </section>`;
}

function renderGuideSteps(steps) {
  return `<ol class="setup-steps">${steps.map((step, index) => `<li>
    <span class="step-number">${index + 1}</span><div><h3>${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description)}</p>
    ${step.command ? `<div class="command-block"><code>${escapeHtml(step.command)}</code><button class="icon-button copy-command" data-command-index="${index}" aria-label="复制命令">${icon(state.copied === step.command ? "check" : "copy")}</button></div>` : ""}</div>
  </li>`).join("")}</ol>`;
}

function renderApiGuide() {
  return `<ol class="setup-steps api-guide-steps">
    <li><span class="step-number">1</span><div><h3>填写兼容接口</h3><p>选择协议，并填写服务商提供的 Base URL 与模型名。</p></div></li>
    <li><span class="step-number">2</span><div><h3>在本机填写 Key</h3><p>不要把 Key 发给任何 Agent；直接在上方密码框中填写。</p></div></li>
    <li><span class="step-number">3</span><div><h3>保存并测试</h3><p>保存设置后，用一段不含隐私的短文本测试连接。</p></div></li>
  </ol>`;
}

function syncDraftFromSettings() {
  const value = (selector) => document.querySelector(selector)?.value;
  const fields = {
    bridgeUrl: value("#bridge-url"),
    cliProvider: value("#cli-provider"),
    cliModel: value("#cli-model"),
    apiBaseUrl: value("#api-base-url"),
    apiProtocol: value("#api-protocol"),
    apiModel: value("#api-model"),
    apiKey: value("#api-key"),
  };
  Object.entries(fields).forEach(([key, fieldValue]) => {
    if (fieldValue !== undefined) state.draft[key] = fieldValue;
  });
}

function attachSettingsEvents() {
  document.querySelectorAll(".back-settings").forEach((button) => button.addEventListener("click", () => void switchView("translator")));
  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => {
    syncDraftFromSettings();
    state.draft.mode = button.dataset.mode;
    state.notice = "";
    renderSettings();
  }));
  document.querySelectorAll("[data-guide]").forEach((button) => button.addEventListener("click", () => {
    syncDraftFromSettings();
    state.guideTab = button.dataset.guide;
    renderSettings();
  }));
  document.querySelector("#cli-provider")?.addEventListener("change", (event) => {
    syncDraftFromSettings();
    state.draft.cliProvider = event.target.value;
    state.draft.cliModel = "";
    if (state.draft.cliProvider === "ollama") state.advancedOpen = true;
    state.bridgeConnected = false;
    state.bridgeReachable = false;
    state.bridgeMessage = "";
    state.bridgeCheckKey = "";
    state.notice = "";
    renderSettings();
  });
  document.querySelector("#advanced-toggle")?.addEventListener("click", () => {
    syncDraftFromSettings();
    state.advancedOpen = !state.advancedOpen;
    renderSettings();
  });
  document.querySelector("#check-bridge")?.addEventListener("click", () => void handleCheckBridge());
  document.querySelector("#start-native-bridge")?.addEventListener("click", () => void handleStartNativeBridge());
  document.querySelector(".native-setup-details")?.addEventListener("toggle", (event) => {
    state.nativeSetupOpen = event.currentTarget.open;
  });
  document.querySelector("#copy-native-install")?.addEventListener("click", () => {
    const extensionId = extensionRuntime ? chrome.runtime.id : "<扩展 ID>";
    const command = `powershell -ExecutionPolicy Bypass -File .\\native-host\\install.ps1 -ExtensionId ${extensionId} -Browser Both`;
    void copyWithFeedback("native-install", command);
  });
  document.querySelector("#save-settings")?.addEventListener("click", () => void handleSaveSettings());
  document.querySelectorAll(".copy-command").forEach((button) => button.addEventListener("click", () => {
    syncDraftFromSettings();
    const command = CLI_GUIDES[state.draft.cliProvider].steps[Number(button.dataset.commandIndex)]?.command;
    if (command) void copyWithFeedback(command, command);
  }));
  document.querySelector("#copy-agent")?.addEventListener("click", () => {
    syncDraftFromSettings();
    void copyWithFeedback("agent", getAgentPrompt(state.draft.mode, state.draft));
  });
}

async function handleStartNativeBridge() {
  syncDraftFromSettings();
  if (!extensionRuntime) return;
  if (!isDefaultBridgeUrl(state.draft.bridgeUrl)) {
    state.notice = "一键启动只允许使用 http://127.0.0.1:8989";
    renderSettings();
    return;
  }
  state.bridgeStarting = true;
  state.notice = "正在通过本机助手启动桥接…";
  state.bridgeMessage = state.notice;
  renderSettings();
  try {
    const result = await chrome.runtime.sendMessage({ type: NATIVE_BRIDGE_START_MESSAGE });
    if (!result?.ok) throw new Error(result?.message || "本机桥接助手启动失败");
    let health;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      health = await checkBridge(state.draft.bridgeUrl, state.draft.cliProvider).catch(() => null);
      if (health) break;
      await new Promise((resolve) => window.setTimeout(resolve, 400));
    }
    if (!health) throw new Error("本机助手已响应，但桥接服务没有在 127.0.0.1:8989 启动");
    state.bridgeReachable = health.ok === true;
    state.bridgeConnected = health.ready === true;
    state.bridgeCheckKey = cliConnectionKey(state.draft);
    state.bridgeMessage = health.statusMessage || "本地桥接已启动";
    state.notice = health.ready
      ? `${result.message} · ${health.statusMessage}`
      : health.statusMessage || "桥接已启动，但当前模型 CLI 尚未就绪";
  } catch (error) {
    state.bridgeConnected = false;
    state.bridgeReachable = false;
    state.bridgeCheckKey = "";
    state.notice = error instanceof Error ? error.message : "本机桥接助手启动失败";
    state.bridgeMessage = state.notice;
  } finally {
    state.bridgeStarting = false;
    renderSettings();
  }
}

async function handleCheckBridge() {
  syncDraftFromSettings();
  state.checking = true;
  state.notice = "";
  renderSettings();
  try {
    const health = await checkBridge(state.draft.bridgeUrl, state.draft.cliProvider);
    state.bridgeReachable = health.ok === true;
    state.bridgeConnected = health.ready;
    state.bridgeCheckKey = cliConnectionKey(state.draft);
    state.bridgeMessage = health.statusMessage || "本地桥接已连接";
    state.notice = health.ready && health.version ? `${health.statusMessage} · ${health.version}` : health.statusMessage;
  } catch {
    state.bridgeConnected = false;
    state.bridgeReachable = false;
    state.bridgeCheckKey = "";
    state.notice = "无法连接本地桥接服务，请先运行 npm run bridge";
    state.bridgeMessage = state.notice;
  } finally {
    state.checking = false;
    renderSettings();
  }
}

async function ensureApiOriginPermission(baseUrl) {
  new URL(baseUrl);
  return true;
}

async function handleSaveSettings() {
  syncDraftFromSettings();
  state.saving = true;
  state.notice = "";
  renderSettings();
  try {
    if (state.draft.mode === "api") {
      if (!state.draft.apiBaseUrl.trim() || !state.draft.apiModel.trim() || !state.draft.apiKey.trim()) {
        throw new Error("请完整填写 API 地址、模型名称和 API Key");
      }
      if (!await ensureApiOriginPermission(state.draft.apiBaseUrl)) throw new Error("未获得该 API 域名的网络访问权限");
      const apiHealth = await checkApiConnection(state.draft);
      state.apiConnected = apiHealth.ok === true;
      state.apiCheckKey = apiConnectionKey(state.draft);
      state.apiMessage = apiHealth.statusMessage;
    }
    if (state.draft.mode === "cli" && state.draft.cliProvider === "ollama" && !state.draft.cliModel.trim()) {
      throw new Error("Ollama 模式必须填写已安装的模型名称");
    }
    state.config = { ...state.draft };
    await saveConfig(state.config);
    if (state.config.mode === "cli") {
      const health = await checkBridge(state.config.bridgeUrl, state.config.cliProvider).catch(() => null);
      state.bridgeReachable = health?.ok === true;
      state.bridgeConnected = health?.ready === true;
      state.bridgeMessage = health?.statusMessage || "";
      state.bridgeCheckKey = health ? cliConnectionKey(state.config) : "";
    } else {
      state.bridgeReachable = false;
      state.bridgeConnected = false;
      state.bridgeMessage = "";
    }
    state.notice = isConnectionReady()
      ? "设置已保存，AI 连接已就绪，可以返回翻译"
      : `设置已保存，但 AI 连接尚未就绪：${connectionGateMessage()}`;
  } catch (error) {
    if (state.draft.mode === "api") {
      state.apiConnected = false;
      state.apiCheckKey = "";
      state.apiMessage = error instanceof Error ? error.message : "API 连接检测失败";
    }
    state.notice = error instanceof Error ? error.message : "保存失败";
  } finally {
    state.saving = false;
    renderSettings();
  }
}

async function copyWithFeedback(id, text) {
  await navigator.clipboard.writeText(text);
  state.copied = id;
  renderSettings();
  window.setTimeout(() => {
    if (state.copied !== id) return;
    state.copied = "";
    if (state.view === "settings") renderSettings();
  }, 1600);
}

function getAgentPrompt(mode, draft) {
  if (mode === "cli") {
    const provider = getCliProviderMeta(draft.cliProvider);
    const guide = CLI_GUIDES[draft.cliProvider];
    const credentialRules = {
      codex: "复用 ChatGPT/Codex 订阅登录，不创建 OpenAI API Key。",
      claude: "优先使用 Claude Pro/Max 订阅登录，不创建 Anthropic API Key。",
      gemini: "使用 Google 账号登录 Antigravity CLI，不创建 Gemini API Key。",
      qwen: "优先复用已有 Coding Plan 或 Provider，只在 /auth 中本地配置。",
      ollama: "只使用 127.0.0.1 上的 Ollama，不创建云端 API Key。",
      glm: "只在官方工具中本地填写 Z.AI 计划凭据。",
      deepseek: "只在本机环境中填写 DeepSeek Key，不在聊天或源码中暴露。",
    };
    return `请帮我配置“${APP_DISPLAY_NAME}”浏览器翻译扩展的 ${provider.label} 连接。项目目录就是当前工作区。

接入说明：${guide.summary}
凭据原则：${credentialRules[draft.cliProvider]}

请按顺序执行并验证：
${guide.steps.map((step, index) => `${index + 1}. ${step.title}：${step.description}${step.command ? ` 建议命令：${step.command}` : ""}`).join("\n")}
5. 启动 npm run bridge 后，请请求 ${draft.bridgeUrl}/health?provider=${draft.cliProvider}，确认 installed=true 且 ready=true。
6. 在 Chrome 或 Edge 中直接加载当前项目根目录，不要运行构建命令。

安全约束：不要读取、打印或复制任何凭据文件和令牌；远程安装脚本执行前先向我确认；不要把桥接服务绑定到 0.0.0.0；不要暴露 8989 端口；遇到登录、Key、订阅或产生费用的步骤时暂停并让我操作。`;
  }
  return `请帮我配置“${APP_DISPLAY_NAME}”浏览器翻译扩展的 API Key 可选连接方式。

当前设置目标：
- API Base URL：${draft.apiBaseUrl}
- 协议：${draft.apiProtocol === "responses" ? "Responses API" : "Chat Completions"}
- 模型：${draft.apiModel || "尚未填写"}

请核对服务商官方文档；不要让我在聊天中粘贴 Key；只指导我在设置页本地填写。保存后用不含隐私的短文本测试翻译。

安全约束：不得将 Key 写入源码、README、命令历史或 Git；不得发送到上述 API Base URL 以外的域名。`;
}

async function initialize() {
  const [config, job, selection] = await Promise.all([
    loadConfig(),
    loadJobState(),
    loadPageSelection(),
  ]);
  state.config = config;
  state.draft = { ...config };
  if (extensionRuntime) {
    state.jobState = job;
    state.pageSelection = selection;
    state.isPending = job?.status === "running";
    if (config.mode === "cli") {
      const health = await checkBridge(config.bridgeUrl, config.cliProvider).catch(() => null);
      state.bridgeReachable = health?.ok === true;
      state.bridgeConnected = health?.ready === true;
      state.bridgeMessage = health?.statusMessage || "";
      state.bridgeCheckKey = health ? cliConnectionKey(config) : "";
    } else if (config.apiBaseUrl.trim() && config.apiModel.trim() && config.apiKey.trim()) {
      try {
        const apiHealth = await checkApiConnection(config);
        state.apiConnected = apiHealth.ok === true;
        state.apiCheckKey = apiConnectionKey(config);
        state.apiMessage = apiHealth.statusMessage;
      } catch (error) {
        state.apiMessage = error instanceof Error ? error.message : "API 连接检测失败";
      }
    }
    state.view = isConnectionReady(config) ? "translator" : "settings";
    if (state.view === "settings") state.notice = connectionGateMessage(config);
  } else if (previewConnectionState === "ready") {
    state.bridgeConnected = true;
    state.bridgeReachable = true;
    state.bridgeMessage = "Codex CLI 已就绪";
    state.bridgeCheckKey = cliConnectionKey(config);
  } else if (previewConnectionState === "error") {
    state.view = "settings";
    state.bridgeMessage = "无法连接本地桥接服务";
    state.notice = connectionGateMessage(config);
  }
  if (state.view === "settings") renderSettings();
  else renderTranslator();
  void refreshSelection();
  window.setInterval(() => void refreshSelection(), 900);

  if (extensionRuntime) {
    chrome.storage.onChanged.addListener((changes) => {
      if (changes[JOB_STATE_KEY]?.newValue) {
        state.jobState = changes[JOB_STATE_KEY].newValue;
        state.isPending = state.jobState.status === "running";
      }
      if (changes[PAGE_SELECTION_KEY]) state.pageSelection = changes[PAGE_SELECTION_KEY].newValue ?? null;
      if (state.view === "translator") renderTranslator();
    });
  }
}

void initialize();
