// @ts-check

export const APP_DISPLAY_NAME = "Jeffrey Type Transfer";

export const CLI_PROVIDERS = [
  { value: "codex", label: "Codex CLI", shortLabel: "Codex CLI", authLabel: "ChatGPT 登录 · 默认" },
  { value: "claude", label: "Claude Code", shortLabel: "Claude Code", authLabel: "Claude Pro / Max 登录" },
  { value: "gemini", label: "Gemini · Antigravity CLI", shortLabel: "Antigravity CLI", authLabel: "Google 登录" },
  { value: "qwen", label: "Qwen Code", shortLabel: "Qwen Code", authLabel: "Coding Plan / 已有 Provider" },
  { value: "ollama", label: "Ollama 本地模型", shortLabel: "Ollama", authLabel: "完全本机 · 无云端 Key" },
  { value: "glm", label: "GLM Coding Plan · Claude Code", shortLabel: "GLM · Claude Code", authLabel: "GLM Coding Plan 配置" },
  { value: "deepseek", label: "DeepSeek · Claude Code", shortLabel: "DeepSeek · Claude Code", authLabel: "DeepSeek Key 配置" },
];

/** @param {string} provider */
export function getCliProviderMeta(provider) {
  return CLI_PROVIDERS.find((item) => item.value === provider) ?? CLI_PROVIDERS[0];
}

export const DEFAULT_CONFIG = {
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
    summary: "使用 ChatGPT/Codex 订阅登录，不需要 OpenAI API Key。",
    steps: [
      { title: "安装 Codex CLI", description: "已安装时可以跳过。", command: "npm install -g @openai/codex" },
      { title: "登录 ChatGPT 账号", description: "复用固定的 Codex 凭据目录，并自动发现更新后的桌面版 CLI。", command: "powershell -ExecutionPolicy Bypass -File .\\native-host\\codex-login.ps1" },
      { title: "确认登录状态", description: "只检查状态，不要读取凭据文件。", command: "powershell -ExecutionPolicy Bypass -File .\\native-host\\codex-login.ps1 -Status" },
      { title: "启动本地桥接", description: "可手动运行，或注册本机助手后在扩展中一键启动。", command: "npm run bridge" },
    ],
  },
  claude: {
    summary: "支持 Claude Pro / Max 订阅登录，也支持 Anthropic Console。",
    steps: [
      { title: "安装 Claude Code", description: "官方 npm 安装方式。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "登录 Claude 账号", description: "运行后选择 Claude.ai 订阅登录。", command: "claude" },
      { title: "确认登录状态", description: "应看到 loggedIn=true。", command: "claude auth status" },
      { title: "启动本地桥接", description: `在 ${APP_DISPLAY_NAME} 中选择 Claude Code 后再检测。`, command: "npm run bridge" },
    ],
  },
  gemini: {
    summary: `Google 个人账号已迁移到 Antigravity CLI；${APP_DISPLAY_NAME} 使用新的 agy 命令。`,
    steps: [
      { title: "安装 Antigravity CLI", description: "执行远程安装脚本前请核对官方地址。", command: "irm https://antigravity.google/cli/install.ps1 | iex" },
      { title: "使用 Google 账号登录", description: "首次运行会打开浏览器登录。", command: "agy" },
      { title: "确认 CLI 可用", description: "插件使用结构化的非交互输出。", command: "agy --version" },
      { title: "启动本地桥接", description: `在 ${APP_DISPLAY_NAME} 中选择 Gemini · Antigravity CLI。`, command: "npm run bridge" },
    ],
  },
  qwen: {
    summary: "Qwen Code 支持无头 JSON Schema；需要 Coding Plan、ModelStudio Key 或已配置的 Provider。",
    steps: [
      { title: "安装 Qwen Code", description: "需要 Node.js 22 或更高版本。", command: "npm install -g @qwen-code/qwen-code@latest" },
      { title: "配置模型服务", description: "运行后输入 /auth，选择 Coding Plan、ModelStudio 或已有 Provider。", command: "qwen" },
      { title: "确认 CLI 可用", description: "Qwen OAuth 免费层已经停止。", command: "qwen --version" },
      { title: "启动本地桥接", description: "桥接使用 safe mode 和结构化输出。", command: "npm run bridge" },
    ],
  },
  ollama: {
    summary: "模型与文本都留在本机；需要安装 Ollama、下载模型并填写模型名称。",
    steps: [
      { title: "安装 Ollama", description: "Windows 推荐使用官方安装器；API 默认运行在 127.0.0.1:11434。" },
      { title: "下载本地模型", description: "根据显存、内存和语言需求选择模型。", command: "ollama pull <模型名称>" },
      { title: "确认模型名称", description: "把列表中的名称原样填入模型名称。", command: "ollama ls" },
      { title: "启动本地桥接", description: "插件通过本地 API 请求结构化结果。", command: "npm run bridge" },
    ],
  },
  glm: {
    summary: "GLM Coding Plan 通过 Claude Code 的兼容端点接入，需要 Z.AI Coding Plan 凭据。",
    steps: [
      { title: "安装 Claude Code", description: "GLM 使用 Claude Code 作为 CLI 外壳。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "运行 Z.AI 配置助手", description: "按官方向导配置，不要把 Key 发给 Agent。", command: "npx @z_ai/coding-helper" },
      { title: "选择 GLM 模型", description: "在高级设置中填写当前计划支持的模型。" },
      { title: "从同一终端启动桥接", description: "确保桥接继承 GLM 配置。", command: "npm run bridge" },
    ],
  },
  deepseek: {
    summary: "DeepSeek 通过 Claude Code 或 Codex 兼容端点接入，需要 DeepSeek API Key。",
    steps: [
      { title: "安装 Claude Code", description: "插件使用 Claude Code 非交互模式。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "配置兼容端点", description: "按官方文档在本机配置，不要把 Key 写进项目。" },
      { title: "填写模型名称", description: "填写官方文档给出的当前模型名。" },
      { title: "从已配置终端启动桥接", description: "桥接只继承环境，不保存 Key。", command: "npm run bridge" },
    ],
  },
};
