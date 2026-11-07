// @ts-check

export const APP_DISPLAY_NAME = "Jeffrey Type Transfer";

// API mode is intentionally retained as a separate future provider boundary.
export const DEFAULT_CONFIG = {
  mode: "cli",
  bridgeUrl: "http://127.0.0.1:47321",
  bridgeToken: "",
  cliModel: "",
  apiBaseUrl: "https://api.openai.com/v1",
  apiKey: "",
  apiModel: "gpt-5-mini",
  apiProtocol: "responses",
  targetLanguage: "English",
  tone: "自然",
};

export const LANGUAGES = [
  { value: "Chinese (Simplified)", label: "简体中文" },
  { value: "Chinese (Traditional)", label: "繁體中文" },
  { value: "English", label: "English" },
  { value: "Japanese", label: "日本語" },
  { value: "Korean", label: "한국어" },
  { value: "French", label: "Français" },
  { value: "German", label: "Deutsch" },
  { value: "Spanish", label: "Español" },
  { value: "Russian", label: "Русский" },
  { value: "Arabic", label: "العربية" },
  { value: "Portuguese", label: "Português" },
  { value: "Italian", label: "Italiano" },
];

export const CLI_GUIDES = {
  codex: {
    summary: "使用 ChatGPT/Codex 登录与本机 HTTP 桥接，不需要 OpenAI API Key。",
    steps: [
      { title: "安装 Codex CLI", description: "已安装时可以跳过。", command: "npm install -g @openai/codex" },
      { title: "启动桥接并按需登录", description: "首次或登录失效时会显示设备登录；已登录时不会再次登录。", command: ".\\native-bridge\\start-bridge.cmd" },
      { title: "在扩展内获取令牌", description: "在设置页点击“获取令牌”；首次请求会绑定当前扩展 ID。" },
      { title: "验证连接", description: "获取后自动验证；也可随时点击“验证连接”。" },
    ],
  },
};
