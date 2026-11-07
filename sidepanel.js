// @ts-check

import {
  APP_DISPLAY_NAME,
  CLI_GUIDES,
  DEFAULT_CONFIG,
  LANGUAGES,
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
import { checkApiConnection, fetchBridgeModels, requestBridgeToken, translateText, verifyBridgeConnection } from "./translate.js";

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
  bridgeModels: [],
  bridgeModelsKey: "",
  apiConnected: false,
  apiCheckKey: "",
  apiMessage: "",
  pageSelection: extensionRuntime || previewEmpty ? null : DEMO_SELECTION,
  jobState: null,
  isPending: false,
  guideTab: "text",
  advancedOpen: false,
  checking: false,
  modelsLoading: false,
  saving: false,
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
  return `${String(config.bridgeUrl).trim()}\n${String(config.bridgeToken).trim()}\n${String(config.cliModel).trim()}`;
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
  return state.bridgeMessage || "请先启动桥接并确认 Codex CLI 已就绪。";
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
  const connected = isConnectionReady(config);
  const connectionLabel = config.mode === "api"
    ? (config.apiKey ? `API · ${config.apiModel}` : "API Key · 待配置")
    : `Codex CLI · ${connected ? "已连接" : "未连接"}`;
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
      message: "Codex CLI 尚未连接，请先打开设置完成配置并检测连接",
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
  const guide = CLI_GUIDES.codex;
  const connectionSection = mode === "cli" ? renderCliSettings(draft) : renderApiSettings(draft);
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

function renderCliSettings(draft) {
  const bridgeStateClass = state.bridgeConnected
    ? "is-online"
    : state.bridgeReachable ? "is-warning" : "is-offline";
  const bridgeStateLabel = state.bridgeConnected
    ? "已就绪"
    : state.bridgeReachable ? "桥接在线" : "未连接";
  const knownModels = state.bridgeModelsKey === modelListKey(draft) ? state.bridgeModels : [];
  const customModel = draft.cliModel && !knownModels.some((model) => model.id === draft.cliModel)
    ? `<option value="${escapeHtml(draft.cliModel)}" selected>当前自定义：${escapeHtml(draft.cliModel)}</option>` : "";
  const defaultOption = knownModels.length ? "" : `<option value="" selected>使用 Codex CLI 默认模型</option>`;
  const modelOptions = `${defaultOption}${customModel}${knownModels.map((model) => `<option value="${escapeHtml(model.id)}" ${model.id === draft.cliModel ? "selected" : ""}>${escapeHtml(model.label)}</option>`).join("")}`;
  return `<section class="connection-section" aria-labelledby="cli-status-heading">
    <div class="section-title-row"><div><span class="section-icon">${icon("terminal")}</span><h2 id="cli-status-heading">Codex CLI 本机桥接</h2></div>
      <span class="connection-label ${bridgeStateClass}"><span class="status-dot"></span>${bridgeStateLabel}</span></div>
    <label class="form-field"><span>本地桥接地址</span><div class="inline-input-button"><input id="bridge-url" value="${escapeHtml(draft.bridgeUrl)}" spellcheck="false" />
      <button class="secondary-button" id="check-bridge" ${state.checking ? "disabled" : ""}>${icon(state.checking ? "refresh" : "server", state.checking ? "spin" : "")}${state.checking ? "验证中" : "验证连接"}</button></div></label>
    <label class="form-field"><span>桥接令牌</span><div class="inline-input-button"><input id="bridge-token" type="password" value="${escapeHtml(draft.bridgeToken)}" autocomplete="off" placeholder="点击右侧按钮自动获取" />
      <button class="secondary-button" id="get-bridge-token" ${!extensionRuntime || state.checking ? "disabled" : ""}>${icon("key")}${extensionRuntime ? "获取令牌" : "需在扩展中使用"}</button></div><small class="provider-summary">首次获取会将此浏览器扩展 ID 绑定到本机桥接。令牌仅存于 chrome.storage.local，不会写入项目源码。</small></label>
    <label class="form-field advanced-field"><span>可选模型名称</span><div class="inline-input-button"><select id="cli-model">${modelOptions}</select>
      <button class="secondary-button" id="get-bridge-models" ${state.modelsLoading || state.checking ? "disabled" : ""}>${icon(state.modelsLoading ? "refresh" : "server", state.modelsLoading ? "spin" : "")}${state.modelsLoading ? "获取中" : "获取模型"}</button></div><small class="provider-summary">点击“获取模型”加载桥接推荐项；实际可用性由 Codex 登录账号决定。</small></label>
    ${state.bridgeMessage ? `<p class="native-bridge-result ${state.bridgeConnected ? "is-success" : state.bridgeReachable ? "is-warning" : "is-error"}">${escapeHtml(state.bridgeMessage)}</p>` : ""}
  </section>`;
}

function modelListKey(config) {
  return `${String(config.bridgeUrl).trim()}\n${String(config.bridgeToken).trim()}`;
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
    bridgeToken: value("#bridge-token"),
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
  document.querySelector("#check-bridge")?.addEventListener("click", () => void handleCheckBridge());
  document.querySelector("#get-bridge-token")?.addEventListener("click", () => void handleGetBridgeToken());
  document.querySelector("#get-bridge-models")?.addEventListener("click", () => void handleGetBridgeModels());
  document.querySelector("#save-settings")?.addEventListener("click", () => void handleSaveSettings());
  document.querySelectorAll(".copy-command").forEach((button) => button.addEventListener("click", () => {
    syncDraftFromSettings();
    const command = CLI_GUIDES.codex.steps[Number(button.dataset.commandIndex)]?.command;
    if (command) void copyWithFeedback(command, command);
  }));
  document.querySelector("#copy-agent")?.addEventListener("click", () => {
    syncDraftFromSettings();
    void copyWithFeedback("agent", getAgentPrompt(state.draft.mode, state.draft));
  });
}

async function handleCheckBridge() {
  syncDraftFromSettings();
  state.checking = true;
  state.notice = "";
  renderSettings();
  try {
    const health = await verifyBridgeConnection(state.draft);
    state.bridgeReachable = health.ok === true;
    state.bridgeConnected = health.codexInstalled && health.loggedIn;
    state.bridgeCheckKey = cliConnectionKey(state.draft);
    state.bridgeMessage = "本地桥接已连接";
    state.notice = `Codex CLI 已连接 · ${health.codexVersion}`;
  } catch (error) {
    state.bridgeConnected = false;
    state.bridgeReachable = false;
    state.bridgeCheckKey = "";
    state.notice = error instanceof Error ? error.message : "无法连接本地桥接服务";
    state.bridgeMessage = state.notice;
  } finally {
    state.checking = false;
    renderSettings();
  }
}

async function handleGetBridgeToken() {
  syncDraftFromSettings();
  state.checking = true;
  state.notice = "正在与本机桥接绑定并获取令牌…";
  renderSettings();
  try {
    state.draft.bridgeToken = await requestBridgeToken(state.draft);
    const health = await verifyBridgeConnection(state.draft);
    state.config = { ...state.draft };
    await saveConfig(state.config);
    state.bridgeReachable = health.ok === true;
    state.bridgeConnected = health.codexInstalled && health.loggedIn;
    state.bridgeCheckKey = cliConnectionKey(state.config);
    state.bridgeMessage = "本机桥接已连接";
    state.notice = `令牌已获取并保存 · Codex CLI ${health.codexVersion}`;
  } catch (error) {
    state.bridgeConnected = false;
    state.bridgeReachable = false;
    state.bridgeCheckKey = "";
    state.notice = error instanceof Error ? error.message : "获取桥接令牌失败";
    state.bridgeMessage = state.notice;
  } finally {
    state.checking = false;
    renderSettings();
  }
}

async function handleGetBridgeModels() {
  syncDraftFromSettings();
  state.modelsLoading = true;
  state.notice = "正在从本机桥接获取模型建议…";
  renderSettings();
  try {
    state.bridgeModels = await fetchBridgeModels(state.draft);
    state.bridgeModelsKey = modelListKey(state.draft);
    state.notice = `已获取 ${state.bridgeModels.length - 1} 个 Codex 模型建议，可从下拉菜单选择`;
  } catch (error) {
    state.bridgeModels = [];
    state.bridgeModelsKey = "";
    state.notice = error instanceof Error ? error.message : "获取模型列表失败";
  } finally {
    state.modelsLoading = false;
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
    state.config = { ...state.draft };
    await saveConfig(state.config);
    if (state.config.mode === "cli") {
      const health = await verifyBridgeConnection(state.config).catch(() => null);
      state.bridgeReachable = health?.ok === true;
      state.bridgeConnected = health?.codexInstalled === true && health?.loggedIn === true;
      state.bridgeMessage = health ? "本地桥接已连接" : "";
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
    const guide = CLI_GUIDES.codex;
    return `请帮我配置“${APP_DISPLAY_NAME}”浏览器翻译扩展的 Codex CLI 本机 HTTP 桥接。项目目录就是当前工作区。

接入说明：${guide.summary}
凭据原则：复用 ChatGPT/Codex 订阅登录，不创建 OpenAI API Key。

请按顺序执行并验证：
${guide.steps.map((step, index) => `${index + 1}. ${step.title}：${step.description}${step.command ? ` 建议命令：${step.command}` : ""}`).join("\n")}
4. 启动 native-bridge\\start-bridge.cmd 后，填写桥接令牌并请求 ${draft.bridgeUrl}/health，确认 codexInstalled=true 且 loggedIn=true。
6. 在 Chrome 或 Edge 中直接加载当前项目根目录，不要运行构建命令。

安全约束：不要打印或复制令牌到聊天；不要把桥接服务绑定到 0.0.0.0；桥接只允许固定 Codex read-only 调用；遇到登录、订阅或产生费用的步骤时暂停并让我操作。`;
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
      const health = await verifyBridgeConnection(config).catch(() => null);
      state.bridgeReachable = health?.ok === true;
      state.bridgeConnected = health?.codexInstalled === true && health?.loggedIn === true;
      state.bridgeMessage = health ? "本地桥接已连接" : "";
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
