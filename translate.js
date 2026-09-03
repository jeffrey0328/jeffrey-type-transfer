// @ts-check

function normalizeBaseUrl(url) {
  return String(url).trim().replace(/\/+$/, "");
}

export function extractResponsesText(payload) {
  if (!payload || typeof payload !== "object") return "";
  if (typeof payload.output_text === "string") return payload.output_text;
  return (payload.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("");
}

export function extractChatText(payload) {
  if (!payload || typeof payload !== "object") return "";
  return payload.choices?.[0]?.message?.content ?? "";
}

export function translationInstructions(request) {
  const source = request.sourceLanguage === "auto"
    ? "automatically detected language"
    : request.sourceLanguage;
  return [
    "You are a precise professional translator.",
    `Translate from ${source} to ${request.targetLanguage}.`,
    `Tone: ${request.tone}.`,
    "Preserve meaning, names, numbers, formatting, paragraph breaks, and Markdown when present.",
    "Return only valid JSON with this shape:",
    '{"translation":"complete translated text"}',
    "Do not use Markdown fences and do not add commentary.",
  ].filter(Boolean).join("\n");
}

export function parseTranslation(raw, provider) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    if (typeof parsed.translation === "string" && parsed.translation) {
      return { translation: parsed.translation, provider };
    }
  } catch {
    // Compatible providers may ignore the requested JSON envelope.
  }
  return { translation: cleaned, provider };
}

async function translateWithApi(config, request) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const instructions = translationInstructions(request);
  const isResponses = config.apiProtocol === "responses";
  const response = await fetch(`${baseUrl}/${isResponses ? "responses" : "chat/completions"}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(
      isResponses
        ? { model: config.apiModel, instructions, input: request.text }
        : {
            model: config.apiModel,
            messages: [
              { role: "system", content: instructions },
              { role: "user", content: request.text },
            ],
          },
    ),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API 请求失败 (${response.status})：${detail.slice(0, 180)}`);
  }
  const payload = await response.json();
  const raw = isResponses ? extractResponsesText(payload) : extractChatText(payload);
  if (!raw) throw new Error("API 返回了空结果");
  return parseTranslation(raw, `API · ${config.apiModel}`);
}

export async function translateText(config, request) {
  if (config.mode === "cli") {
    const response = await fetch(`${normalizeBaseUrl(config.bridgeUrl)}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        clientProtocol: 2,
        provider: config.cliProvider,
        model: config.cliModel.trim() || undefined,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      throw new Error(payload.error || `本地桥接服务请求失败 (${response.status})`);
    }
    return response.json();
  }
  if (!config.apiKey.trim()) throw new Error("请先在连接设置中填写 API Key");
  if (!config.apiModel.trim()) throw new Error("请先填写 API 模型名称");
  return translateWithApi(config, request);
}

export async function checkApiConnection(config) {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const model = String(config.apiModel).trim();
  const apiKey = String(config.apiKey).trim();
  if (!baseUrl || !model || !apiKey) throw new Error("请完整填写 API 地址、模型名称和 API Key");
  let response;
  try {
    response = await fetch(`${baseUrl}/models/${encodeURIComponent(model)}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error("无法连接 API 服务，请检查地址和网络");
  }
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API 连接检测失败 (${response.status})：${detail.slice(0, 180)}`);
  }
  return { ok: true, statusMessage: `API 已连接 · ${model}` };
}

export async function checkBridge(bridgeUrl, provider = "codex") {
  const response = await fetch(
    `${normalizeBaseUrl(bridgeUrl)}/health?provider=${encodeURIComponent(provider)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("桥接服务没有正常响应");
  return response.json();
}
