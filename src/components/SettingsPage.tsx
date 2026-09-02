import { useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardCopy,
  Code2,
  Copy,
  ExternalLink,
  KeyRound,
  LoaderCircle,
  Save,
  Server,
  ShieldCheck,
  Terminal,
  X,
} from "lucide-react";
import { checkBridge } from "../lib/translate";
import {
  CLI_PROVIDERS,
  getCliProviderMeta,
  type AppConfig,
  type CliProvider,
  type ConnectionMode,
} from "../types";
import { IconButton } from "./IconButton";

interface SettingsPageProps {
  config: AppConfig;
  bridgeConnected: boolean;
  onBack: () => void;
  onSave: (config: AppConfig) => Promise<void>;
  onBridgeStatusChange: (connected: boolean) => void;
}

interface GuideStep {
  title: string;
  description: string;
  command?: string;
}

const CLI_GUIDES: Record<CliProvider, { summary: string; steps: GuideStep[] }> = {
  codex: {
    summary: "使用 ChatGPT/Codex 订阅登录，不需要 OpenAI API Key。",
    steps: [
      { title: "安装 Codex CLI", description: "已安装时可以跳过。", command: "npm install -g @openai/codex" },
      { title: "登录 ChatGPT 账号", description: "浏览器会打开 Codex 登录页。", command: "codex login" },
      { title: "确认登录状态", description: "只检查状态，不要读取凭据文件。", command: "codex login status" },
      { title: "启动本地桥接", description: "保持终端窗口运行。", command: "npm run bridge" },
    ],
  },
  claude: {
    summary: "支持 Claude Pro / Max 订阅登录，也支持 Anthropic Console。",
    steps: [
      { title: "安装 Claude Code", description: "官方 npm 安装方式。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "登录 Claude 账号", description: "运行后选择 Claude.ai 订阅登录。", command: "claude" },
      { title: "确认登录状态", description: "应看到 loggedIn=true。", command: "claude auth status" },
      { title: "启动本地桥接", description: "在 jeffrey-type-transfer 中选择 Claude Code 后再检测。", command: "npm run bridge" },
    ],
  },
  gemini: {
    summary: "Google 个人账号已迁移到 Antigravity CLI；jeffrey-type-transfer 使用新的 agy 命令。",
    steps: [
      { title: "安装 Antigravity CLI", description: "这是 Google 当前的个人账号终端入口；执行远程安装脚本前请核对官方地址。", command: "irm https://antigravity.google/cli/install.ps1 | iex" },
      { title: "使用 Google 账号登录", description: "首次运行会打开浏览器登录。", command: "agy" },
      { title: "确认 CLI 可用", description: "插件使用结构化的非交互输出。", command: "agy --version" },
      { title: "启动本地桥接", description: "在 jeffrey-type-transfer 中选择 Gemini · Antigravity CLI。", command: "npm run bridge" },
    ],
  },
  qwen: {
    summary: "Qwen Code 原生支持无头 JSON Schema；需要 Coding Plan、ModelStudio Key 或已配置的第三方 Provider。",
    steps: [
      { title: "安装 Qwen Code", description: "需要 Node.js 22 或更高版本。", command: "npm install -g @qwen-code/qwen-code@latest" },
      { title: "配置模型服务", description: "运行后输入 /auth，选择 Alibaba Cloud Coding Plan、ModelStudio 或已有的第三方 Provider。", command: "qwen" },
      { title: "确认 CLI 可用", description: "Qwen OAuth 免费层已经停止，不要按旧教程选择 Qwen OAuth。", command: "qwen --version" },
      { title: "启动本地桥接", description: "桥接会使用 safe mode 和结构化输出，不读取项目上下文。", command: "npm run bridge" },
    ],
  },
  ollama: {
    summary: "模型与文本都留在本机，不需要云端 API Key；需要安装 Ollama、下载模型，并填写模型名称。",
    steps: [
      { title: "安装 Ollama", description: "Windows 推荐使用 Ollama 官方安装器；安装后 API 默认运行在 127.0.0.1:11434。" },
      { title: "下载本地模型", description: "根据显存、内存和语言需求选择模型；下载会占用数 GB 到数十 GB空间。", command: "ollama pull <模型名称>" },
      { title: "确认模型名称", description: "把列表中的名称按原样填入下方“模型名称”。", command: "ollama ls" },
      { title: "启动本地桥接", description: "插件通过 Ollama 本地 API 请求 JSON Schema 结构化结果。", command: "npm run bridge" },
    ],
  },
  glm: {
    summary: "GLM Coding Plan 通过 Claude Code 的 Anthropic 兼容端点接入，需要 Z.AI Coding Plan 凭据。",
    steps: [
      { title: "安装 Claude Code", description: "GLM 使用 Claude Code 作为 CLI 外壳。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "运行 Z.AI 配置助手", description: "按官方向导配置 Coding Plan；不要把 Key 发给 Agent。", command: "npx @z_ai/coding-helper" },
      { title: "选择 GLM 模型", description: "可在高级设置中填写 GLM-4.7、GLM-5.1 等当前计划支持的模型。" },
      { title: "从同一终端启动桥接", description: "确保桥接继承 Claude Code / GLM 配置。", command: "npm run bridge" },
    ],
  },
  deepseek: {
    summary: "DeepSeek 没有独立订阅登录 CLI；官方方案是通过 Claude Code 或 Codex 兼容端点，需要 DeepSeek API Key。",
    steps: [
      { title: "安装 Claude Code", description: "插件使用 Claude Code 的非交互模式。", command: "npm install -g @anthropic-ai/claude-code" },
      { title: "配置 DeepSeek Anthropic 兼容端点", description: "按 DeepSeek 官方文档在本机设置 ANTHROPIC_BASE_URL 与凭据；不要把 Key 写进项目。" },
      { title: "填写模型名称", description: "在高级设置中填写 DeepSeek 官方文档给出的当前模型名。" },
      { title: "从已配置终端启动桥接", description: "桥接只继承环境，不保存 DeepSeek Key。", command: "npm run bridge" },
    ],
  },
};

function getAgentPrompt(mode: ConnectionMode, draft: AppConfig) {
  if (mode === "cli") {
    const provider = getCliProviderMeta(draft.cliProvider);
    const guide = CLI_GUIDES[draft.cliProvider];
    const credentialRules: Record<CliProvider, string> = {
      codex: "目标是不使用 OpenAI API Key，复用 ChatGPT/Codex 订阅登录。",
      claude: "优先使用 Claude Pro/Max 订阅登录，不创建 Anthropic API Key。",
      gemini: "使用 Google 账号登录 Antigravity CLI，不创建 Gemini API Key。",
      qwen: "Qwen OAuth 免费层已经停止；优先复用已有 Coding Plan 或 Provider，只让我在 /auth 交互界面本地配置。",
      ollama: "只使用 127.0.0.1 上的 Ollama 本地 API，不创建、不索要任何云端 API Key。",
      glm: "GLM Coding Plan 需要 Z.AI 提供的计划凭据；只让我在官方工具中本地填写，不要在聊天中索要。",
      deepseek: "DeepSeek 官方兼容接入需要 DeepSeek API Key；只让我在本机环境中填写，不要在聊天、源码或命令输出中暴露。",
    };
    return `请帮我配置“jeffrey-type-transfer”浏览器翻译扩展的 ${provider.label} 连接。项目目录就是当前工作区。

接入说明：${guide.summary}
凭据原则：${credentialRules[draft.cliProvider]}

请按顺序执行并验证：
${guide.steps.map((step, index) => `${index + 1}. ${step.title}：${step.description}${step.command ? ` 建议命令：${step.command}` : ""}`).join("\n")}
5. 启动 npm run bridge 后，请请求 ${draft.bridgeUrl}/health?provider=${draft.cliProvider}，确认 installed=true 且 ready=true。
6. 运行 npm run build，并说明如何重新加载 dist 目录。

安全约束：不要读取、打印或复制任何凭据文件和令牌；远程安装脚本执行前先向我确认；不要把桥接服务绑定到 0.0.0.0；不要暴露 8989 端口；遇到登录、Key、订阅或产生费用的步骤时暂停并让我操作。`;
  }

  return `请帮我配置“jeffrey-type-transfer”浏览器翻译扩展的 API Key 可选连接方式。

当前设置目标：
- API Base URL：${draft.apiBaseUrl}
- 协议：${draft.apiProtocol === "responses" ? "Responses API" : "Chat Completions"}
- 模型：${draft.apiModel || "尚未填写"}

请完成：
1. 根据服务商官方文档核对 Base URL、协议和模型名称是否兼容。
2. 不要让我在聊天中粘贴 Key，也不要读取或打印现有 Key；只指导我在 jeffrey-type-transfer 设置页的密码框中本地填写。
3. 说明浏览器会为该 API 域名申请网络权限，并提醒扩展本地存储不是专业密钥保险库。
4. 保存后用一段不含隐私的短文本测试翻译，并根据状态码定位问题。

安全约束：不得将 Key 写入源码、README、命令历史或 Git；不得发送到除上述 API Base URL 之外的域名；任何可能改变账号或产生费用的操作都先征得我同意。`;
}

async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

async function ensureApiOriginPermission(baseUrl: string) {
  if (typeof chrome === "undefined" || !chrome.permissions) return true;
  const url = new URL(baseUrl);
  if (url.origin === "https://api.openai.com") return true;
  return chrome.permissions.request({ origins: [`${url.origin}/*`] });
}

export function SettingsPage({
  config,
  bridgeConnected,
  onBack,
  onSave,
  onBridgeStatusChange,
}: SettingsPageProps) {
  const [draft, setDraft] = useState(config);
  const [guideTab, setGuideTab] = useState<"text" | "agent">("text");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState("");
  const mode = draft.mode;
  const cliGuide = CLI_GUIDES[draft.cliProvider];
  const cliProviderMeta = getCliProviderMeta(draft.cliProvider);
  const agentPrompt = useMemo(() => getAgentPrompt(mode, draft), [mode, draft]);

  const setMode = (nextMode: ConnectionMode) => {
    setDraft((current) => ({ ...current, mode: nextMode }));
    setNotice("");
  };

  const handleCheckBridge = async () => {
    setChecking(true);
    setNotice("");
    try {
      const health = await checkBridge(draft.bridgeUrl, draft.cliProvider);
      onBridgeStatusChange(health.ready);
      setNotice(
        health.ready
          ? `${health.statusMessage}${health.version ? ` · ${health.version}` : ""}`
          : health.statusMessage,
      );
    } catch {
      onBridgeStatusChange(false);
      setNotice("无法连接本地桥接服务，请先运行 npm run bridge");
    } finally {
      setChecking(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice("");
    try {
      if (draft.mode === "api") {
        if (!draft.apiBaseUrl.trim() || !draft.apiModel.trim() || !draft.apiKey.trim()) {
          throw new Error("请完整填写 API 地址、模型名称和 API Key");
        }
        const granted = await ensureApiOriginPermission(draft.apiBaseUrl);
        if (!granted) throw new Error("未获得该 API 域名的网络访问权限");
      }
      if (draft.mode === "cli" && draft.cliProvider === "ollama" && !draft.cliModel.trim()) {
        throw new Error("Ollama 模式必须填写已安装的模型名称");
      }
      await onSave(draft);
      setNotice("设置已保存");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (id: string, text: string) => {
    await copyText(text);
    setCopied(id);
    setTimeout(() => setCopied(""), 1600);
  };

  return (
    <main className="app-shell settings-shell">
      <header className="settings-header">
        <IconButton label="返回翻译" onClick={onBack}>
          <ArrowLeft size={24} />
        </IconButton>
        <h1>连接与设置</h1>
        <IconButton label="关闭设置" onClick={onBack}>
          <X size={23} />
        </IconButton>
      </header>

      <div className="mode-switch" role="tablist" aria-label="模型连接方式">
        <button
          role="tab"
          aria-selected={mode === "cli"}
          className={mode === "cli" ? "is-active" : ""}
          onClick={() => setMode("cli")}
        >
          <Terminal size={20} /> 本地 CLI
          <span className="recommended-tag">默认</span>
        </button>
        <button
          role="tab"
          aria-selected={mode === "api"}
          className={mode === "api" ? "is-active" : ""}
          onClick={() => setMode("api")}
        >
          <KeyRound size={19} /> API Key
        </button>
      </div>

      {mode === "cli" ? (
        <section className="connection-section" aria-labelledby="cli-status-heading">
          <div className="section-title-row">
            <div>
              <span className="section-icon"><Terminal size={18} /></span>
              <h2 id="cli-status-heading">{cliProviderMeta.label}</h2>
            </div>
            <span className={`connection-label ${bridgeConnected ? "is-online" : "is-offline"}`}>
              <span className="status-dot" /> {bridgeConnected ? "已连接" : "未连接"}
            </span>
          </div>
          <label className="form-field cli-provider-field">
            <span>CLI / 模型服务</span>
            <select
              value={draft.cliProvider}
              onChange={(event) => {
                const cliProvider = event.target.value as CliProvider;
                setDraft((current) => ({ ...current, cliProvider, cliModel: "" }));
                if (cliProvider === "ollama") setAdvancedOpen(true);
                onBridgeStatusChange(false);
                setNotice("");
              }}
            >
              {CLI_PROVIDERS.map((provider) => (
                <option key={provider.value} value={provider.value}>
                  {provider.label} · {provider.authLabel}
                </option>
              ))}
            </select>
            <small className="provider-summary">{cliGuide.summary}</small>
          </label>
          <label className="form-field">
            <span>本地桥接地址</span>
            <div className="inline-input-button">
              <input
                value={draft.bridgeUrl}
                onChange={(event) => setDraft((current) => ({ ...current, bridgeUrl: event.target.value }))}
                spellCheck={false}
              />
              <button className="secondary-button" onClick={() => void handleCheckBridge()} disabled={checking}>
                {checking ? <LoaderCircle className="spin" size={17} /> : <Server size={17} />}
                检测连接
              </button>
            </div>
          </label>
          {draft.cliProvider !== "ollama" ? (
            <button className="advanced-toggle" onClick={() => setAdvancedOpen((value) => !value)}>
              <Code2 size={18} /> 高级设置
              <ChevronDown className={advancedOpen ? "is-rotated" : ""} size={18} />
            </button>
          ) : null}
          {advancedOpen || draft.cliProvider === "ollama" ? (
            <label className="form-field advanced-field">
              <span>
                {draft.cliProvider === "ollama"
                  ? "Ollama 模型名称（必填，按 ollama ls 原样填写）"
                  : "模型名称（留空则使用当前 CLI 默认模型）"}
              </span>
              <input
                value={draft.cliModel}
                placeholder={
                  draft.cliProvider === "ollama"
                    ? "按 ollama ls 的输出原样填写"
                    : draft.cliProvider === "codex"
                    ? "例如：gpt-5.6-codex"
                    : draft.cliProvider === "claude"
                      ? "例如：sonnet"
                      : draft.cliProvider === "glm"
                        ? "例如：GLM-4.7"
                        : "留空使用 CLI 默认模型"
                }
                onChange={(event) => setDraft((current) => ({ ...current, cliModel: event.target.value }))}
              />
            </label>
          ) : null}
        </section>
      ) : (
        <section className="connection-section" aria-labelledby="api-status-heading">
          <div className="section-title-row">
            <div>
              <span className="section-icon"><KeyRound size={18} /></span>
              <h2 id="api-status-heading">API Key 连接</h2>
            </div>
            <span className={`connection-label ${draft.apiKey ? "is-online" : "is-offline"}`}>
              <span className="status-dot" /> {draft.apiKey ? "已填写" : "未配置"}
            </span>
          </div>
          <div className="api-fields">
            <label className="form-field">
              <span>API Base URL</span>
              <input
                value={draft.apiBaseUrl}
                placeholder="https://api.openai.com/v1"
                onChange={(event) => setDraft((current) => ({ ...current, apiBaseUrl: event.target.value }))}
                spellCheck={false}
              />
            </label>
            <div className="two-column-fields">
              <label className="form-field">
                <span>API 协议</span>
                <select
                  value={draft.apiProtocol}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      apiProtocol: event.target.value as AppConfig["apiProtocol"],
                    }))
                  }
                >
                  <option value="responses">Responses API</option>
                  <option value="chat-completions">Chat Completions</option>
                </select>
              </label>
              <label className="form-field">
                <span>模型名称</span>
                <input
                  value={draft.apiModel}
                  placeholder="gpt-5-mini"
                  onChange={(event) => setDraft((current) => ({ ...current, apiModel: event.target.value }))}
                />
              </label>
            </div>
            <label className="form-field">
              <span>API Key</span>
              <input
                type="password"
                value={draft.apiKey}
                autoComplete="off"
                placeholder="只保存在当前浏览器配置中"
                onChange={(event) => setDraft((current) => ({ ...current, apiKey: event.target.value }))}
              />
            </label>
            <p className="security-note">
              <ShieldCheck size={16} /> Key 不会进入项目代码，但浏览器本地存储并非专业密钥保险库；只在受信任的个人设备上使用。
            </p>
          </div>
        </section>
      )}

      <section className="guide-section" aria-labelledby="guide-heading">
        <div className="guide-tabs" role="tablist" aria-label="配置引导形式">
          <button
            role="tab"
            aria-selected={guideTab === "text"}
            className={guideTab === "text" ? "is-active" : ""}
            onClick={() => setGuideTab("text")}
          >
            文字说明
          </button>
          <button
            role="tab"
            aria-selected={guideTab === "agent"}
            className={guideTab === "agent" ? "is-active" : ""}
            onClick={() => setGuideTab("agent")}
          >
            Agent 提示词
          </button>
        </div>
        <h2 id="guide-heading" className="sr-only">配置引导</h2>

        {guideTab === "text" ? (
          mode === "cli" ? (
            <ol className="setup-steps">
              {cliGuide.steps.map((item, index) => (
                <li key={`${draft.cliProvider}-${item.title}`}>
                  <span className="step-number">{index + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.description}</p>
                    {item.command ? (
                      <div className="command-block">
                        <code>{item.command}</code>
                        <IconButton
                          label={`复制命令：${item.command}`}
                          onClick={() => void handleCopy(item.command!, item.command!)}
                        >
                          {copied === item.command ? <Check size={17} /> : <Copy size={17} />}
                        </IconButton>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="setup-steps api-guide-steps">
              <li><span className="step-number">1</span><div><h3>填写兼容接口</h3><p>选择 Responses API 或 Chat Completions，并填写服务商提供的 Base URL 与模型名。</p></div></li>
              <li><span className="step-number">2</span><div><h3>在本机填写 Key</h3><p>不要把 Key 发给任何 Agent；直接在上方密码框中填写。</p></div></li>
              <li><span className="step-number">3</span><div><h3>保存并授权域名</h3><p>浏览器只会申请访问你填写的 API 域名；保存后返回翻译页测试。</p></div></li>
            </ol>
          )
        ) : (
          <div className="agent-prompt-panel">
            <div className="agent-prompt-heading">
              <div><Code2 size={18} /><span>把下面提示词交给你的编码 Agent</span></div>
              <button onClick={() => void handleCopy("agent", agentPrompt)}>
                {copied === "agent" ? <Check size={16} /> : <ClipboardCopy size={16} />}
                {copied === "agent" ? "已复制" : "复制提示词"}
              </button>
            </div>
            <pre>{agentPrompt}</pre>
          </div>
        )}
      </section>

      <div className="settings-actions">
        <button className="primary-button" onClick={() => void handleSave()} disabled={saving}>
          {saving ? <LoaderCircle className="spin" size={19} /> : <Save size={18} />}
          {saving ? "正在保存" : "保存设置"}
        </button>
        <button className="text-link-button" onClick={onBack}>
          返回翻译 <ExternalLink size={15} />
        </button>
      </div>
      <div className={`settings-notice ${notice.includes("失败") || notice.includes("无法") || notice.includes("未") || notice.includes("请") ? "is-error" : ""}`} aria-live="polite">
        {notice || "API Key 模式完全可选；默认仍推荐 Codex CLI。"}
      </div>
    </main>
  );
}
