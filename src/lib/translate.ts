import type {
  AlignedSegment,
  AppConfig,
  TranslationRequest,
  TranslationResult,
} from "../types";

function normalizeBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function extractResponsesText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof data.output_text === "string") return data.output_text;
  return (
    data.output
      ?.flatMap((item) => item.content ?? [])
      .filter((item) => item.type === "output_text" && typeof item.text === "string")
      .map((item) => item.text)
      .join("") ?? ""
  );
}

function extractChatText(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const data = payload as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? "";
}

function translationInstructions(request: TranslationRequest) {
  const source = request.sourceLanguage === "auto" ? "automatically detected language" : request.sourceLanguage;
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

function parseAlignedTranslation(
  raw: string,
  source: string,
  provider: string,
): TranslationResult {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(cleaned) as {
      detectedLanguage?: unknown;
      translation?: unknown;
      segments?: Array<{ source?: unknown; target?: unknown }>;
    };
    const segments: AlignedSegment[] = Array.isArray(parsed.segments)
      ? parsed.segments.flatMap((segment) =>
          typeof segment.source === "string" && typeof segment.target === "string"
            ? [{ source: segment.source, target: segment.target }]
            : [],
        )
      : [];
    const translation =
      typeof parsed.translation === "string"
        ? parsed.translation
        : segments.map((segment) => segment.target).join("");
    if (translation && segments.length > 0) {
      const alignedSegments =
        segments.map((segment) => segment.source).join("") === source
          ? segments
          : [{ source, target: translation }];
      return {
        translation,
        detectedLanguage:
          typeof parsed.detectedLanguage === "string" ? parsed.detectedLanguage : undefined,
        provider,
        segments: alignedSegments,
      };
    }
  } catch {
    // Fall through to a single aligned segment for compatible providers that ignore JSON instructions.
  }
  return {
    translation: cleaned,
    provider,
    segments: [{ source, target: cleaned }],
  };
}

async function translateWithApi(
  config: AppConfig,
  request: TranslationRequest,
): Promise<TranslationResult> {
  const baseUrl = normalizeBaseUrl(config.apiBaseUrl);
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    "Content-Type": "application/json",
  };
  const instructions = translationInstructions(request);
  const isResponses = config.apiProtocol === "responses";
  const response = await fetch(
    `${baseUrl}/${isResponses ? "responses" : "chat/completions"}`,
    {
      method: "POST",
      headers,
      body: JSON.stringify(
        isResponses
          ? {
              model: config.apiModel,
              instructions,
              input: request.text,
            }
          : {
              model: config.apiModel,
              messages: [
                { role: "system", content: instructions },
                { role: "user", content: request.text },
              ],
            },
      ),
    },
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`API 请求失败 (${response.status})：${detail.slice(0, 180)}`);
  }

  const payload: unknown = await response.json();
  const raw = isResponses ? extractResponsesText(payload) : extractChatText(payload);
  if (!raw) throw new Error("API 返回了空结果");
  return parseAlignedTranslation(raw, request.text, `API · ${config.apiModel}`);
}

export async function translateText(
  config: AppConfig,
  request: TranslationRequest,
): Promise<TranslationResult> {
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
      const payload = (await response.json().catch(() => ({}))) as { error?: string };
      throw new Error(payload.error || `本地桥接服务请求失败 (${response.status})`);
    }
    return (await response.json()) as TranslationResult;
  }

  if (!config.apiKey.trim()) throw new Error("请先在连接设置中填写 API Key");
  if (!config.apiModel.trim()) throw new Error("请先填写 API 模型名称");

  return translateWithApi(config, request);
}

export async function checkBridge(bridgeUrl: string, provider = "codex") {
  const response = await fetch(
    `${normalizeBaseUrl(bridgeUrl)}/health?provider=${encodeURIComponent(provider)}`,
    {
    signal: AbortSignal.timeout(5000),
    },
  );
  if (!response.ok) throw new Error("桥接服务没有正常响应");
  return (await response.json()) as {
    ok: boolean;
    provider: string;
    label: string;
    installed: boolean;
    authenticated: boolean;
    ready: boolean;
    statusMessage: string;
    version?: string;
  };
}

export {
  extractChatText,
  extractResponsesText,
  parseAlignedTranslation,
  translationInstructions,
};
