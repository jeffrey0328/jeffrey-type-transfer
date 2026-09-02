export type ConnectionMode = "cli" | "api";
export type ApiProtocol = "responses" | "chat-completions";
export type CliProvider =
  | "codex"
  | "claude"
  | "gemini"
  | "qwen"
  | "ollama"
  | "glm"
  | "deepseek";

export const CLI_PROVIDERS: Array<{
  value: CliProvider;
  label: string;
  shortLabel: string;
  authLabel: string;
}> = [
  { value: "codex", label: "Codex CLI", shortLabel: "Codex CLI", authLabel: "ChatGPT 登录 · 默认" },
  { value: "claude", label: "Claude Code", shortLabel: "Claude Code", authLabel: "Claude Pro / Max 登录" },
  { value: "gemini", label: "Gemini · Antigravity CLI", shortLabel: "Antigravity CLI", authLabel: "Google 登录" },
  { value: "qwen", label: "Qwen Code", shortLabel: "Qwen Code", authLabel: "Coding Plan / 已有 Provider" },
  { value: "ollama", label: "Ollama 本地模型", shortLabel: "Ollama", authLabel: "完全本机 · 无云端 Key" },
  { value: "glm", label: "GLM Coding Plan · Claude Code", shortLabel: "GLM · Claude Code", authLabel: "GLM Coding Plan 配置" },
  { value: "deepseek", label: "DeepSeek · Claude Code", shortLabel: "DeepSeek · Claude Code", authLabel: "DeepSeek Key 配置" },
];

export function getCliProviderMeta(provider: CliProvider) {
  return CLI_PROVIDERS.find((item) => item.value === provider) ?? CLI_PROVIDERS[0];
}

export interface AppConfig {
  mode: ConnectionMode;
  bridgeUrl: string;
  cliProvider: CliProvider;
  cliModel: string;
  apiBaseUrl: string;
  apiKey: string;
  apiModel: string;
  apiProtocol: ApiProtocol;
  targetLanguage: string;
  tone: string;
}

export interface TranslationRequest {
  text: string;
  sourceLanguage: string;
  targetLanguage: string;
  tone: string;
}

export interface TranslationResult {
  translation: string;
  detectedLanguage?: string;
  provider: string;
  segments: AlignedSegment[];
}

export interface AlignedSegment {
  source: string;
  target: string;
}

export interface PageSelection {
  token: string;
  text: string;
  start: number;
  end: number;
  elementName: "input" | "textarea";
}

export interface ComparisonRecord extends TranslationResult {
  source: string;
  targetLanguage: string;
  createdAt: number;
}

export interface TranslationJobState {
  status: "running" | "success" | "error";
  message: string;
  source?: string;
  createdAt: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  mode: "cli",
  bridgeUrl: "http://127.0.0.1:8989",
  cliProvider: "codex",
  cliModel: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  apiModel: "gpt-5-mini",
  apiProtocol: "responses",
  targetLanguage: "English",
  tone: "自然",
};
