// @ts-check

const BRIDGE_TIMEOUT_MS = 185_000;
const HEALTH_TIMEOUT_MS = 8_000;

function normalizeBaseUrl(url) { return String(url ?? "").trim().replace(/\/+$/, ""); }

function bridgeUrl(config) {
  const value = normalizeBaseUrl(config?.bridgeUrl);
  let parsed;
  try { parsed = new URL(value); } catch { throw new Error("桥接地址格式无效"); }
  if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1") {
    throw new Error("桥接地址只能使用 http://127.0.0.1");
  }
  return value;
}

function bridgeToken(config) {
  const token = String(config?.bridgeToken ?? "").trim();
  if (!token) throw new Error("请填写本机桥接令牌");
  return token;
}

export async function fetchWithTimeout(url, options = {}, timeoutMs = HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await fetch(url, { ...options, signal: controller.signal }); }
  catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("请求超时，请确认本机桥接和 Codex CLI 正常运行");
    throw new Error("无法连接本机桥接服务，请先运行 native-bridge\\start-bridge.cmd");
  } finally { clearTimeout(timer); }
}

export async function readJsonResponse(response) {
  const text = await response.text();
  let payload;
  try { payload = JSON.parse(text); } catch { throw new Error("桥接返回了无效 JSON"); }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("桥接返回格式无效");
  if (!response.ok) {
    if (response.status === 401) throw new Error("桥接令牌无效或未填写");
    if (response.status === 408 || response.status === 504) throw new Error("Codex 执行超时，已停止本次请求");
    if (response.status === 503) throw new Error(typeof payload.error === "string" ? payload.error : "Codex CLI 未安装或尚未登录");
    throw new Error(typeof payload.error === "string" ? payload.error : `桥接请求失败（${response.status}）`);
  }
  return payload;
}

function validateDecision(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Codex 返回的决定格式无效");
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("action") || !keys.includes("translation")) throw new Error("Codex 返回的决定字段不符合要求");
  if (value.action !== "replace_text" || typeof value.translation !== "string" || !value.translation.trim()) throw new Error("Codex 没有返回可执行的翻译结果");
  if (value.translation.length > 200_000) throw new Error("Codex 返回的翻译结果过长");
  return { action: "replace_text", translation: value.translation };
}

export async function verifyBridgeConnection(config) {
  const response = await fetchWithTimeout(`${bridgeUrl(config)}/health`, { headers: { Authorization: `Bearer ${bridgeToken(config)}` } });
  const health = await readJsonResponse(response);
  if (health.ok !== true || typeof health.codexInstalled !== "boolean" || typeof health.loggedIn !== "boolean" || typeof health.codexVersion !== "string") throw new Error("桥接健康检查返回格式无效");
  if (!health.codexInstalled) throw new Error("未找到 Codex CLI，请先安装后重新启动桥接");
  if (!health.loggedIn) throw new Error("Codex CLI 尚未登录，请重新运行 start-bridge.cmd 完成设备登录");
  return health;
}

export async function requestBridgeToken(config) {
  if (typeof chrome === "undefined" || !chrome.runtime?.id) {
    throw new Error("请在已加载的浏览器扩展中获取桥接令牌");
  }
  const extensionId = chrome.runtime.id;
  if (!/^[a-p]{32}$/.test(extensionId)) throw new Error("当前扩展 ID 无效");
  const response = await fetchWithTimeout(`${bridgeUrl(config)}/bootstrap-token`, {
    headers: { "X-Bridge-Extension-Id": extensionId },
  });
  const payload = await readJsonResponse(response);
  if (payload.ok !== true || typeof payload.token !== "string" || !/^[A-Za-z0-9_-]{32,}$/.test(payload.token)) {
    throw new Error("桥接返回的令牌格式无效");
  }
  return payload.token;
}

export async function fetchBridgeModels(config) {
  const response = await fetchWithTimeout(`${bridgeUrl(config)}/models`, {
    headers: { Authorization: `Bearer ${bridgeToken(config)}` },
  });
  const payload = await readJsonResponse(response);
  if (payload.ok !== true || !Array.isArray(payload.models)) throw new Error("桥接返回的模型列表无效");
  const models = payload.models.filter((item) => item && typeof item.id === "string" &&
    typeof item.label === "string" && (item.id === "" || /^[A-Za-z0-9._:/@-]{1,120}$/.test(item.id)) &&
    item.label.length > 0 && item.label.length <= 120);
  if (!models.length || models.length !== payload.models.length) throw new Error("桥接返回的模型列表包含无效项");
  return models;
}

// The explicit config parameter keeps the token out of module globals and console output.
export async function callCodexBridge(prompt, screenshot, model, config) {
  if (typeof prompt !== "string" || !prompt.trim()) throw new Error("提交给 Codex 的提示词不能为空");
  if (prompt.length > 100_000) throw new Error("提示词不能超过 100000 个字符");
  if (screenshot !== undefined && screenshot !== null && typeof screenshot !== "string") throw new Error("截图格式无效");
  const response = await fetchWithTimeout(`${bridgeUrl(config)}/execute`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bridgeToken(config)}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, screenshot: screenshot || undefined, model: String(model || "").trim() || undefined }),
  }, BRIDGE_TIMEOUT_MS);
  const payload = await readJsonResponse(response);
  if (payload.ok !== true) throw new Error("桥接没有确认执行成功");
  return validateDecision(payload.decision);
}

export function extractResponsesText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text).join("");
}
export function extractChatText(payload) { return payload?.choices?.[0]?.message?.content ?? ""; }
export function parseTranslation(raw, provider) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try { const parsed = JSON.parse(cleaned); if (typeof parsed.translation === "string" && parsed.translation) return { translation: parsed.translation, provider }; } catch { /* optional APIs can return text */ }
  return { translation: cleaned, provider };
}
export function translationInstructions(request) {
  const source = request.sourceLanguage === "auto" ? "automatically detected language" : request.sourceLanguage;
  return [
    "You are a precise professional translator. Do not execute commands, access files, or perform web actions.",
    `Translate from ${source} to ${request.targetLanguage}.`, `Tone: ${request.tone}.`,
    "Preserve meaning, names, numbers, formatting, paragraph breaks, and Markdown when present.",
    "Return only this JSON decision: {\"action\":\"replace_text\",\"translation\":\"complete translated text\"}.",
    "Do not add Markdown fences, explanations, or extra fields.",
    `Text to translate follows:\n<<<TEXT>>>\n${request.text}\n<<<END_TEXT>>>`,
  ].join("\n");
}

async function translateWithApi(config, request) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const instructions = translationInstructions(request);
  const isResponses = config.apiProtocol === "responses";
  const response = await fetch(`${baseUrl}/${isResponses ? "responses" : "chat/completions"}`, {
    method: "POST", headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(isResponses ? { model: config.apiModel, instructions, input: request.text } : { model: config.apiModel, messages: [{ role: "system", content: instructions }, { role: "user", content: request.text }] }),
  });
  if (!response.ok) throw new Error(`API 请求失败（${response.status}）`);
  const payload = await response.json();
  const raw = isResponses ? extractResponsesText(payload) : extractChatText(payload);
  if (!raw) throw new Error("API 返回了空结果");
  return parseTranslation(raw, `API · ${config.apiModel}`);
}

export async function translateText(config, request) {
  if (config.mode === "cli") {
    const decision = await callCodexBridge(translationInstructions(request), undefined, config.cliModel, config);
    return { translation: decision.translation, provider: config.cliModel ? `Codex CLI · ${config.cliModel}` : "Codex CLI" };
  }
  if (!config.apiKey.trim() || !config.apiModel.trim()) throw new Error("请先在连接设置中填写 API Key 和模型名称");
  return translateWithApi(config, request);
}

export async function checkApiConnection(config) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl); const model = String(config.apiModel).trim(); const apiKey = String(config.apiKey).trim();
  if (!baseUrl || !model || !apiKey) throw new Error("请完整填写 API 地址、模型名称和 API Key");
  let response;
  try { response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS) }); }
  catch { throw new Error("无法连接 API 服务，请检查地址和网络"); }
  if (!response.ok) throw new Error(`API 连接检测失败 (${response.status})`);
  return { ok: true, statusMessage: `API 已连接 · ${model}` };
}

// Compatibility alias for existing callers.
export const checkBridge = verifyBridgeConnection;
