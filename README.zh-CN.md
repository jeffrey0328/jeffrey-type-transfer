# jeffrey-type-transfer

[English](./README.md) | **简体中文**

jeffrey-type-transfer 是一个 Chromium MV3 侧边栏翻译扩展。它可以翻译任意语言文本，默认通过本机 **Codex CLI** 使用你已有的 ChatGPT/Codex 登录，无需 OpenAI API Key；也支持 Claude Code、Gemini/Antigravity CLI、Qwen Code、Ollama 本地模型，以及通过兼容 CLI 接入 GLM 和 DeepSeek。API Key 直连仍然是可选方式。

## 功能

- 在网页 `input` 或 `textarea` 中选中文字，侧边栏才会启用目标语言、语气和翻译按钮
- 自动识别源语言，并翻译到 12 种常用目标语言
- 自然、正式、简洁、口语四种语气
- 默认连接本机 Codex CLI，不要求 OpenAI API Key
- 可切换 Claude Code、Gemini/Antigravity CLI、Qwen Code、Ollama、GLM Coding Plan 和 DeepSeek 兼容接入
- 可选接入 Responses API 或兼容 Chat Completions 的模型服务
- 点击“翻译并替换选中内容”、右键菜单或 `Alt + Shift + T`，都会直接原位替换页面选区
- 侧边栏保留最近一次双语对照；选中原文片段时，对应译文会联动高亮
- CLI 与 API Key 各自提供“文字说明”和“Agent 提示词”两种配置引导

## 快速开始：默认 Codex CLI

### 1. 安装并登录 Codex CLI

```powershell
npm install -g @openai/codex
codex login
```

`codex login` 会打开浏览器。使用有 Codex 权限的 ChatGPT 账号完成登录。可以运行下面的命令确认状态：

```powershell
codex login status
```

Codex CLI 支持通过 ChatGPT 订阅登录；官方说明见 [Codex authentication](https://learn.chatgpt.com/docs/auth)。

### 2. 安装项目依赖并启动本地桥接

```powershell
npm install
npm run bridge
```

桥接服务只监听 `127.0.0.1:8989`。保持这个终端窗口运行。

### 3. 构建扩展

```powershell
npm run build
```

### 4. 加载到 Chrome 或 Edge

1. Chrome 打开 `chrome://extensions`，Edge 打开 `edge://extensions`。
2. 打开“开发者模式”。
3. 选择“加载已解压的扩展程序”。
4. 选择本项目的 `dist` 文件夹。
5. 点击工具栏里的“jeffrey-type-transfer”，浏览器会打开侧边栏。
6. 在“连接与设置”中点击“检测连接”。

## CLI 适配结论

以下结论按 2026-09-02 的官方资料整理。jeffrey-type-transfer 把“实际执行的 CLI”和“背后的模型服务”分开，因此 GLM、DeepSeek 可以复用成熟 CLI 的非交互能力。

| 选择项 | 实际命令 | 登录/凭据 | 结构化输出 | 插件建议 |
| --- | --- | --- | --- | --- |
| Codex CLI | `codex exec` | ChatGPT/Codex 登录，可不使用 OpenAI API Key | 原生 `--output-schema` | 默认、最稳定 |
| Claude Code | `claude -p` | Claude Pro/Max 登录，或 Anthropic Console | `--output-format json` + `--json-schema` | 已适配 |
| Gemini | `agy -p` | Google 登录 | `--output-format json` + `--json-schema` | 使用新的 Antigravity CLI |
| Qwen Code | `qwen` stdin | Coding Plan、ModelStudio Key 或已配置 Provider | `--output-format json` + `--json-schema` | 已适配；旧 Qwen OAuth 不可用 |
| Ollama | 本机 `/api/chat` | 无云端 Key；本地模型 | API 原生 JSON Schema | 已适配；模型名称必填 |
| GLM Coding Plan | `claude -p` | Z.AI Coding Plan 凭据 | 复用 Claude Code 结构化输出 | 已适配兼容端点 |
| DeepSeek | `claude -p` | DeepSeek API Key | 复用 Claude Code 结构化输出 | 已适配兼容端点 |

需要特别区分：

- Claude Code 官方支持 Claude Pro/Max 订阅登录和非交互 JSON/JSON Schema 输出，适合这种本机桥接。[Claude Code 安装与登录](https://docs.anthropic.com/en/docs/claude-code/getting-started)、[CLI reference](https://code.claude.com/docs/en/cli-usage)
- Google 已把个人账号的 Gemini CLI 终端体验迁移到 Antigravity CLI。jeffrey-type-transfer 的新适配使用 `agy`；旧 `gemini` 命令不再作为个人账号默认入口。[迁移公告](https://github.com/google-gemini/gemini-cli/discussions/28017)、[Antigravity CLI](https://github.com/google-antigravity/antigravity-cli)
- Qwen Code 的无头模式支持 stdin、JSON 输出和 JSON Schema，很适合本机桥接；但 Qwen OAuth 免费层已于 2026-04-15 停止，新配置应使用 Coding Plan、ModelStudio 或已有第三方 Provider。[Qwen Code headless mode](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/)、[authentication](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/)
- Ollama 在 Windows 上默认提供 `http://localhost:11434` 本地 API，插件固定访问 loopback 地址，并向 `/api/chat` 传递 JSON Schema；文本无需发送到云端。[Ollama Windows](https://docs.ollama.com/windows)、[structured outputs](https://docs.ollama.com/capabilities/structured-outputs)
- GLM Coding Plan 不是“无凭据 CLI”。官方方案是配置 Claude Code、OpenCode 等受支持工具，使用 Z.AI 的 Coding Plan 端点和计划凭据。[GLM Coding Plan Quick Start](https://docs.z.ai/devpack/quick-start)
- DeepSeek 当前也不是独立订阅登录 CLI。官方提供 Claude Code 和 Codex 的兼容接入，但需要 DeepSeek API Key。[DeepSeek Claude Code integration](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/)、[DeepSeek Codex integration](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)

因此，如果目标是完全不购买模型 API Key，优先顺序是：已有 ChatGPT/Codex 订阅用 Codex CLI；希望文本完全留在本机则用 Ollama；已有 Claude Pro/Max 用 Claude Code；可用 Google 个人账号时使用 Antigravity CLI。Qwen Code、GLM 和 DeepSeek 的适配已做好，但仍需要现有计划、Provider 或 API Key。

### 下一批建议适配

1. **OpenCode**：适合做通用供应商路由层，官方 `opencode run --format json` 支持非交互原始事件，并覆盖大量模型提供商；但它没有像 Qwen/Codex 那样直接的最终 JSON Schema 契约，需要增加事件归并与严格结果校验后再上线。[OpenCode CLI](https://opencode.ai/docs/cli/)、[providers](https://opencode.ai/docs/providers/)

### Claude Code

```powershell
npm install -g @anthropic-ai/claude-code
claude
claude auth status
npm run bridge
```

然后在 jeffrey-type-transfer 设置中选择“Claude Code”并检测连接。

### Gemini / Antigravity CLI

按照 [Antigravity CLI 官方安装说明](https://github.com/google-antigravity/antigravity-cli)安装并运行 `agy` 完成 Google 登录，再在 jeffrey-type-transfer 设置中选择“Gemini · Antigravity CLI”。远程安装脚本应先核对来源再执行。

### Qwen Code

```powershell
npm install -g @qwen-code/qwen-code@latest
qwen
qwen --version
npm run bridge
```

首次运行后输入 `/auth`，选择 Alibaba Cloud Coding Plan、ModelStudio 或已配置的第三方 Provider。不要按旧教程选择 Qwen OAuth；其免费层已经停止。插件用 stdin 发送翻译提示，并启用 safe mode、零工具调用和 JSON Schema 输出。

### Ollama 本地模型

先按 [Ollama Windows 官方说明](https://docs.ollama.com/windows)安装，然后下载一个适合本机硬件和目标语言的指令模型：

```powershell
ollama pull <模型名称>
ollama ls
npm run bridge
```

在 jeffrey-type-transfer 设置中选择“Ollama 本地模型”，并把 `ollama ls` 显示的模型名称原样填入。桥接固定访问 `127.0.0.1:11434`，不会把模型服务暴露到局域网；模型文件可能占用数 GB 到数十 GB空间。

### GLM 与 DeepSeek

这两种模式都使用 Claude Code 作为非交互 CLI 外壳。请先按照上面的官方集成文档在本机配置服务商端点和凭据，然后从同一个终端运行 `npm run bridge`。本地桥接不会读取或保存凭据，只会继承 CLI 自己的配置或进程环境。

## 使用方式

1. 在网页的单行输入框或多行文本框中拖选要翻译的文字。
2. 打开 jeffrey-type-transfer 侧边栏。看到“已锁定选区”后，选择目标语言和语气。
3. 点击“翻译并替换选中内容”，或直接按 `Alt + Shift + T`。
4. 插件会确认原文没有被改动，再将译文原位替换到同一个输入框中。
5. 在侧边栏的双语对照里拖选原文片段，可以查看对应的译文高亮。

为避免误改密码或复杂编辑器，当前只处理 `text`、`search`、`url`、`tel`、`email` 类型的 `input` 和普通 `textarea`，不处理密码框或富文本编辑器。

## 可选：API Key 模式

API Key 不是默认路径，也不是运行插件的必需项。需要时，在设置中切换到 **API Key** 并填写：

- API Base URL
- Responses API 或 Chat Completions 协议
- 模型名称
- API Key

自定义 HTTPS 域名会触发浏览器的按域名网络权限申请。Key 只保存在扩展的 `chrome.storage.local` 中，不会写入仓库；但浏览器本地存储不是专业密钥保险库，只应在受信任的个人设备上使用。

## Codex CLI 桥接原理

浏览器扩展受安全模型限制，不能直接执行本机命令。因此 jeffrey-type-transfer 包含一个很小的本地 HTTP 桥接服务：

```text
浏览器侧边栏 → http://127.0.0.1:8989 → 所选 CLI / 本地运行时 → 译文
```

Codex 默认适配器使用非交互模式：

```text
codex exec --ephemeral --skip-git-repo-check --sandbox read-only --output-schema bridge/translation-schema.json -
```

Claude Code 使用 `claude -p --output-format json --json-schema ... --tools ""`；Antigravity 使用 `agy -p --output-format json --json-schema ...`；Qwen Code 使用 stdin、safe mode、零工具调用和 JSON Schema；Ollama 使用本机 `/api/chat` structured output。翻译提示词不经过 shell。结构化输出会同时返回完整译文和语义对齐片段，供侧边栏联动高亮。服务不接受任意命令，只开放 `/health` 和 `/translate` 两个接口；最多并发两个翻译任务，并限制请求体和文本长度。

## 开发命令

```powershell
npm run dev       # 在 http://127.0.0.1:5173 预览界面
npm run bridge    # 启动 Codex CLI 本地桥接
npm run check     # TypeScript 检查
npm run build     # 生成 dist 扩展目录
```

在普通网页预览中，可以检查界面与双语高亮；右键菜单、快捷键、页面选区捕获和原位替换需要在已加载的扩展中测试。访问 `http://127.0.0.1:5173/?empty=1` 可以预览“尚未选中”的禁用状态。

## 项目结构

```text
bridge/server.mjs          多模型 CLI 适配与本地桥接
public/manifest.json       Chromium MV3 清单
src/background.ts          右键菜单、快捷键、翻译与原位替换任务
src/components/            翻译和设置界面
src/lib/                   页面选区、存储与模型接入逻辑
design/                    视觉设计稿
dist/                      可加载的扩展构建结果
```

## 安全说明

- 不要把 `~/.codex/auth.json`、API Key 或访问令牌加入 Git、聊天记录或错误日志。
- 不要把桥接服务改为监听 `0.0.0.0`，也不要把 8989 端口暴露到公网。
- Codex 适配器显式使用只读 sandbox；Claude Code 适配器禁用内置工具。Antigravity 适配器依赖其本机权限策略，并在提示词中明确禁止工具调用。
- Qwen Code 适配器启用 safe mode 并把工具调用上限设为 0；Ollama 适配器只访问固定的 `127.0.0.1:11434`。
- GLM 与 DeepSeek 的 Key 应只配置在服务商官方工具、CLI 配置或启动桥接的本机环境中，不要填入插件源码。
- 页面文本会发送给你选择的模型服务；不要翻译不应离开设备或账号边界的敏感内容。
