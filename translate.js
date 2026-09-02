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
    "Split the source and translation into short, semantically aligned segments in original order.",
    "Every source character must appear exactly once across the source segments, including punctuation and whitespace.",
    "Return only valid JSON with this shape:",
    '{"detectedLanguage":"language name","translation":"complete translated text","segments":[{"source":"source segment","target":"matching translated segment"}]}',
    "Do not use Markdown fences and do not add commentary.",
  ].join("\n");
}

export function parseAlignedTranslation(raw, source, provider) {
  const cleaned = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned);
    const segments = Array.isArray(parsed.segments)
      ? parsed.segments.flatMap((segment) =>
          typeof segment.source === "string" && typeof segment.target === "string"
            ? [{ source: segment.source, target: segment.target }]
            : [],
        )
      : [];
    const translation = typeof parsed.translation === "string"
      ? parsed.translation
      : segments.map((segment) => segment.target).join("");
    if (translation && segments.length > 0) {
      return {
        translation,
        detectedLanguage:
          typeof parsed.detectedLanguage === "string" ? parsed.detectedLanguage : undefined,
        provider,
        segments:
          segments.map((segment) => segment.source).join("") === source
            ? segments
            : [{ source, target: translation }],
      };
    }
  } catch {
    // Compatible providers may ignore the requested JSON envelope.
  }
  return {
    translation: cleaned,
    provider,
    segments: [{ source, target: cleaned }],
  };
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
  return parseAlignedTranslation(raw, request.text, `API · ${config.apiModel}`);
}

export async function translateText(config, request) {
  if (config.mode === "cli") {
    const response = await fetch(`${normalizeBaseUrl(config.bridgeUrl)}/translate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
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

export async function checkBridge(bridgeUrl, provider = "codex") {
  const response = await fetch(
    `${normalizeBaseUrl(bridgeUrl)}/health?provider=${encodeURIComponent(provider)}`,
    { signal: AbortSignal.timeout(5000) },
  );
  if (!response.ok) throw new Error("桥接服务没有正常响应");
  return response.json();
}
