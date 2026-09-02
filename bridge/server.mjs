import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const HOST = process.env.YUQIAO_HOST || "127.0.0.1";
const PORT = Number(process.env.YUQIAO_PORT || 8989);
const MAX_BODY_BYTES = 120_000;
const MAX_TEXT_LENGTH = 50_000;
const RUN_TIMEOUT_MS = Number(process.env.YUQIAO_TIMEOUT_MS || 120_000);
const OUTPUT_SCHEMA_PATH = fileURLToPath(new URL("./translation-schema.json", import.meta.url));
const OUTPUT_SCHEMA_TEXT = readFileSync(OUTPUT_SCHEMA_PATH, "utf8");
const OUTPUT_SCHEMA = JSON.parse(OUTPUT_SCHEMA_TEXT);
const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const PROVIDER_IDS = new Set(["codex", "claude", "gemini", "qwen", "ollama", "glm", "deepseek"]);
let activeRuns = 0;

function getAdapter(provider) {
  switch (provider) {
    case "claude":
      return {
        id: provider,
        label: "Claude Code",
        command: process.env.CLAUDE_BIN || "claude",
        versionArgs: ["--version"],
        auth: "claude",
        runner: "claude",
      };
    case "gemini":
      return {
        id: provider,
        label: "Gemini · Antigravity CLI",
        command: process.env.AGY_BIN || "agy",
        versionArgs: ["--version"],
        auth: "deferred",
        runner: "antigravity",
      };
    case "qwen":
      return {
        id: provider,
        label: "Qwen Code",
        command: process.env.QWEN_BIN || "qwen",
        versionArgs: ["--version"],
        auth: "qwen",
        runner: "qwen",
      };
    case "ollama":
      return {
        id: provider,
        label: "Ollama 本地模型",
        command: process.env.OLLAMA_BIN || "ollama",
        versionArgs: ["--version"],
        auth: "local",
        runner: "ollama",
      };
    case "glm":
      return {
        id: provider,
        label: "GLM Coding Plan · Claude Code",
        command: process.env.CLAUDE_BIN || "claude",
        versionArgs: ["--version"],
        auth: "external",
        runner: "claude",
      };
    case "deepseek":
      return {
        id: provider,
        label: "DeepSeek · Claude Code",
        command: process.env.CLAUDE_BIN || "claude",
        versionArgs: ["--version"],
        auth: "external",
        runner: "claude",
      };
    default:
      return {
        id: "codex",
        label: "Codex CLI",
        command: process.env.CODEX_BIN || "codex",
        versionArgs: ["--version"],
        auth: "codex",
        runner: "codex",
      };
  }
}

function normalizeProvider(value) {
  return typeof value === "string" && PROVIDER_IDS.has(value) ? value : "codex";
}

function setCors(request, response) {
  const origin = request.headers.origin || "";
  const allowed =
    origin === "" ||
    /^chrome-extension:\/\/[a-p]{32}$/.test(origin) ||
    /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (allowed && origin) response.setHeader("Access-Control-Allow-Origin", origin);
  response.setHeader("Vary", "Origin");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  return allowed;
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("输入内容过长"));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(new Error("请求格式无效"));
      }
    });
    request.on("error", reject);
  });
}

function run(command, args, { input = "", timeout = 10_000, label = "模型 CLI" } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${label} 响应超时`));
    }, timeout);
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const out = Buffer.concat(stdout).toString("utf8").trim();
      const err = Buffer.concat(stderr).toString("utf8").trim();
      if (code === 0) resolve({ stdout: out, stderr: err });
      else reject(new Error(err || out || `${label} 已退出 (${code})`));
    });
    child.stdin.end(input, "utf8");
  });
}

async function checkAuthentication(adapter) {
  if (adapter.auth === "codex") {
    await run(adapter.command, ["login", "status"], { timeout: 5_000, label: adapter.label });
    return { authenticated: true, ready: true, statusMessage: "已通过 ChatGPT/Codex 登录" };
  }
  if (adapter.auth === "claude") {
    const result = await run(adapter.command, ["auth", "status"], {
      timeout: 5_000,
      label: adapter.label,
    });
    const status = JSON.parse(result.stdout || "{}");
    const authenticated = status.loggedIn === true;
    return {
      authenticated,
      ready: authenticated,
      statusMessage: authenticated ? "已通过 Claude 账号登录" : "Claude Code 尚未登录",
    };
  }
  if (adapter.auth === "external") {
    return {
      authenticated: false,
      ready: true,
      statusMessage: "CLI 已安装；兼容模型配置将在首次翻译时校验",
    };
  }
  if (adapter.auth === "qwen") {
    return {
      authenticated: false,
      ready: true,
      statusMessage: "Qwen Code 已安装；Coding Plan / Provider 配置将在首次翻译时校验",
    };
  }
  return {
    authenticated: false,
    ready: true,
    statusMessage: "CLI 已安装；Google 登录状态将在首次翻译时校验",
  };
}

async function ollamaHealth(adapter) {
  try {
    const [tagsResponse, versionResponse] = await Promise.all([
      fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(5_000) }),
      fetch(`${OLLAMA_BASE_URL}/api/version`, { signal: AbortSignal.timeout(5_000) }),
    ]);
    if (!tagsResponse.ok) throw new Error("Ollama 模型列表不可用");
    const tags = await tagsResponse.json();
    const version = versionResponse.ok ? (await versionResponse.json()).version : undefined;
    const models = Array.isArray(tags.models)
      ? tags.models.map((item) => item?.name).filter((name) => typeof name === "string")
      : [];
    return {
      ok: true,
      provider: adapter.id,
      label: adapter.label,
      installed: true,
      authenticated: true,
      ready: models.length > 0,
      statusMessage:
        models.length > 0
          ? `Ollama 已运行 · ${models.length} 个本地模型`
          : "Ollama 已运行，但还没有本地模型",
      version,
      models,
    };
  } catch {
    try {
      const versionResult = await run(adapter.command, adapter.versionArgs, {
        timeout: 5_000,
        label: adapter.label,
      });
      return {
        ok: true,
        provider: adapter.id,
        label: adapter.label,
        installed: true,
        authenticated: true,
        ready: false,
        statusMessage: "Ollama 已安装，但本地服务尚未运行",
        version: versionResult.stdout,
      };
    } catch {
      return {
        ok: true,
        provider: adapter.id,
        label: adapter.label,
        installed: false,
        authenticated: false,
        ready: false,
        statusMessage: "未找到 Ollama",
      };
    }
  }
}

async function health(provider) {
  const adapter = getAdapter(provider);
  if (adapter.runner === "ollama") return ollamaHealth(adapter);
  try {
    const versionResult = await run(adapter.command, adapter.versionArgs, {
      label: adapter.label,
    });
    try {
      const auth = await checkAuthentication(adapter);
      return {
        ok: true,
        provider: adapter.id,
        label: adapter.label,
        installed: true,
        ...auth,
        version: versionResult.stdout,
      };
    } catch {
      return {
        ok: true,
        provider: adapter.id,
        label: adapter.label,
        installed: true,
        authenticated: false,
        ready: false,
        statusMessage:
          adapter.id === "codex"
            ? "Codex CLI 已安装，但尚未登录；请在终端运行 codex login"
            : `${adapter.label} 已安装，但尚未完成登录`,
        version: versionResult.stdout,
      };
    }
  } catch {
    return {
      ok: true,
      provider: adapter.id,
      label: adapter.label,
      installed: false,
      authenticated: false,
      ready: false,
      statusMessage: `未找到 ${adapter.label}`,
    };
  }
}

function createPrompt({ text, sourceLanguage, targetLanguage, tone }) {
  const source = sourceLanguage === "auto" ? "自动识别源语言" : `源语言：${sourceLanguage}`;
  return [
    "你是一名严谨的专业翻译。只执行翻译，不运行命令、不访问文件、不调用工具。",
    source,
    `目标语言：${targetLanguage}`,
    `语气：${tone}`,
    "保留原意、专有名词、数字、段落、Markdown 与格式。",
    "把原文和译文拆分成简短、顺序一致的语义对应片段。",
    "所有原文字符（包括标点与空白）必须在 source 片段中按原顺序出现且只出现一次。",
    "translation 必须是可以直接替换网页选区的完整译文。",
    "严格按照输出 JSON Schema 返回，不要解释、标题、引号、Markdown 围栏或任何额外说明。",
    "",
    "待翻译文本：",
    "<<<TRANSLATION_INPUT>>>",
    text,
    "<<<END_TRANSLATION_INPUT>>>",
  ].join("\n");
}

function parseJsonText(value) {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

function findStructuredTranslation(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return null;
  if (typeof value === "string") {
    const parsed = parseJsonText(value);
    return parsed ? findStructuredTranslation(parsed, depth + 1) : null;
  }
  if (Array.isArray(value)) {
    for (let index = value.length - 1; index >= 0; index -= 1) {
      const found = findStructuredTranslation(value[index], depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== "object") return null;
  if (typeof value.translation === "string" && Array.isArray(value.segments)) return value;
  for (const key of [
    "structured_output",
    "structured_result",
    "result",
    "response",
    "output",
    "data",
    "message",
    "content",
  ]) {
    const found = findStructuredTranslation(value[key], depth + 1);
    if (found) return found;
  }
  return null;
}

function validateTranslation(parsed, text, providerLabel) {
  const segments = Array.isArray(parsed?.segments)
    ? parsed.segments.filter(
        (segment) =>
          segment && typeof segment.source === "string" && typeof segment.target === "string",
      )
    : [];
  if (typeof parsed?.translation !== "string" || !parsed.translation || segments.length === 0) {
    throw new Error(`${providerLabel} 返回的翻译结果不完整`);
  }
  if (segments.map((segment) => segment.source).join("") !== text) {
    throw new Error(`${providerLabel} 返回的原文分段与选区不一致，请重试`);
  }
  return {
    translation: parsed.translation,
    detectedLanguage:
      typeof parsed.detectedLanguage === "string" ? parsed.detectedLanguage : undefined,
    segments,
  };
}

function buildRun(adapter, model) {
  if (adapter.runner === "codex") {
    const args = [
      "exec",
      "--ephemeral",
      "--skip-git-repo-check",
      "--sandbox",
      "read-only",
    ];
    if (model) args.push("--model", model);
    args.push("--output-schema", OUTPUT_SCHEMA_PATH, "-");
    return { args, mode: "direct" };
  }
  if (adapter.runner === "claude") {
    const args = [
      "-p",
      "--output-format",
      "json",
      "--json-schema",
      OUTPUT_SCHEMA_TEXT,
      "--tools",
      "",
      "--no-session-persistence",
    ];
    if (model) args.push("--model", model);
    return { args, mode: "envelope" };
  }
  if (adapter.runner === "qwen") {
    const args = [
      "--output-format",
      "json",
      "--json-schema",
      OUTPUT_SCHEMA_TEXT,
      "--safe-mode",
      "--max-tool-calls",
      "0",
      "--max-session-turns",
      "3",
    ];
    if (model) args.push("--model", model);
    return { args, mode: "envelope" };
  }
  const args = [
    "-p",
    "--output-format",
    "json",
    "--json-schema",
    OUTPUT_SCHEMA_PATH,
  ];
  if (model) args.push("--model", model);
  return { args, mode: "envelope" };
}

async function translateWithOllama(adapter, payload, model) {
  if (!model) throw new Error("Ollama 模式必须填写已安装的模型名称");
  let response;
  try {
    response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: "user",
            content: `${createPrompt(payload)}\n\nJSON Schema：\n${OUTPUT_SCHEMA_TEXT}`,
          },
        ],
        stream: false,
        format: OUTPUT_SCHEMA,
        options: { temperature: 0 },
      }),
      signal: AbortSignal.timeout(RUN_TIMEOUT_MS),
    });
  } catch {
    throw new Error("无法连接 Ollama 本地服务，请确认 Ollama 正在运行");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string" ? `Ollama：${result.error}` : `Ollama 请求失败 (${response.status})`,
    );
  }
  const parsed = findStructuredTranslation(result.message?.content);
  if (!parsed) throw new Error("Ollama 没有返回有效的对齐翻译结果");
  return {
    ...validateTranslation(parsed, payload.text, adapter.label),
    provider: `${adapter.label} · ${model}`,
  };
}

async function translate(payload) {
  const text = typeof payload.text === "string" ? payload.text : "";
  const sourceLanguage = typeof payload.sourceLanguage === "string" ? payload.sourceLanguage : "auto";
  const targetLanguage = typeof payload.targetLanguage === "string" ? payload.targetLanguage : "English";
  const tone = typeof payload.tone === "string" ? payload.tone : "自然";
  const model = typeof payload.model === "string" ? payload.model.trim() : "";
  const adapter = getAdapter(normalizeProvider(payload.provider));
  if (!text.trim()) throw new Error("请输入要翻译的内容");
  if (text.length > MAX_TEXT_LENGTH) throw new Error(`输入不能超过 ${MAX_TEXT_LENGTH} 个字符`);
  if (model && !/^[A-Za-z0-9._:/@-]{1,120}$/.test(model)) throw new Error("模型名称格式无效");

  if (adapter.runner === "ollama") {
    return translateWithOllama(
      adapter,
      { text, sourceLanguage, targetLanguage, tone },
      model,
    );
  }

  if (adapter.auth === "codex" || adapter.auth === "claude") {
    const auth = await checkAuthentication(adapter).catch(() => ({ ready: false }));
    if (!auth.ready) throw new Error(`${adapter.label} 尚未登录，请先完成账号登录`);
  }

  const invocation = buildRun(adapter, model);
  let result;
  try {
    result = await run(adapter.command, invocation.args, {
      input: createPrompt({ text, sourceLanguage, targetLanguage, tone }),
      timeout: RUN_TIMEOUT_MS,
      label: adapter.label,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("ENOENT")) throw new Error(`未找到 ${adapter.label}，请先完成安装`);
    throw error;
  }
  if (!result.stdout) throw new Error(`${adapter.label} 返回了空结果`);
  const parsedRoot = parseJsonText(result.stdout);
  const parsed =
    invocation.mode === "direct"
      ? parsedRoot
      : findStructuredTranslation(parsedRoot ?? result.stdout);
  if (!parsed) throw new Error(`${adapter.label} 没有返回有效的对齐翻译结果`);
  return {
    ...validateTranslation(parsed, text, adapter.label),
    provider: model ? `${adapter.label} · ${model}` : adapter.label,
  };
}

const server = createServer(async (request, response) => {
  if (!setCors(request, response)) {
    sendJson(response, 403, { error: "不允许的请求来源" });
    return;
  }
  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  const url = new URL(request.url || "/", `http://${request.headers.host || `${HOST}:${PORT}`}`);
  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, await health(normalizeProvider(url.searchParams.get("provider"))));
    return;
  }
  if (request.method === "POST" && url.pathname === "/translate") {
    if (activeRuns >= 2) {
      sendJson(response, 429, { error: "翻译任务较多，请稍后重试" });
      return;
    }
    activeRuns += 1;
    try {
      sendJson(response, 200, await translate(await readJson(request)));
    } catch (error) {
      const message = error instanceof Error ? error.message : "翻译失败";
      sendJson(response, 400, { error: message.slice(0, 500) });
    } finally {
      activeRuns -= 1;
    }
    return;
  }
  sendJson(response, 404, { error: "未找到该接口" });
});

server.listen(PORT, HOST, () => {
  console.log(`Jeffrey Type Transfer 多模型 CLI 桥接服务运行于 http://${HOST}:${PORT}`);
  console.log("支持 Codex、Claude Code、Gemini/Antigravity、Qwen Code、Ollama、GLM 与 DeepSeek 接入");
  console.log("按 Ctrl+C 停止服务");
});
