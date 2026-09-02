# jeffrey-type-transfer

**English** | [简体中文](./README.zh-CN.md)

jeffrey-type-transfer is a Chromium MV3 side-panel translation extension. Select text inside a web page input, choose a target language, and replace the selection in place with an LLM-generated translation.

The default connection is the local **Codex CLI**, so an existing ChatGPT/Codex login can be used without purchasing an OpenAI API key. Claude Code, Gemini/Antigravity CLI, Qwen Code, Ollama, GLM, DeepSeek, and optional API-key connections are also supported.

## Features

- Activates only after text is selected inside an `input` or `textarea`
- Detects the source language and translates into 12 common target languages
- Natural, formal, concise, and conversational tones
- Uses Codex CLI by default; no OpenAI API key is required
- Supports Claude Code, Gemini/Antigravity CLI, Qwen Code, Ollama, GLM Coding Plan, and DeepSeek-compatible connections
- Optionally supports Responses API and compatible Chat Completions services
- Replaces the selected page text through the side panel, context menu, or `Alt + Shift + T`
- Keeps the latest bilingual comparison and highlights aligned translated segments when source text is selected
- Provides both written setup instructions and a ready-to-use Agent configuration prompt

## Quick Start: Codex CLI

### 1. Install and sign in to Codex CLI

```powershell
npm install -g @openai/codex
codex login
```

`codex login` opens a browser. Sign in with a ChatGPT account that has Codex access, then verify the session:

```powershell
codex login status
```

Codex CLI supports ChatGPT subscription authentication. See [Codex authentication](https://learn.chatgpt.com/docs/auth).

### 2. Install dependencies and start the local bridge

```powershell
npm install
npm run bridge
```

The bridge listens only on `127.0.0.1:8989`. Keep this terminal running.

### 3. Build the extension

```powershell
npm run build
```

### 4. Load it in Chrome or Edge

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project's `dist` directory.
5. Click **jeffrey-type-transfer** in the browser toolbar to open the side panel.
6. Open **Connection & Settings** and click **Check connection**.

## CLI and Local Runtime Support

The following status reflects the official documentation reviewed on 2026-09-02. The extension separates the executable CLI from the underlying model provider, allowing GLM and DeepSeek to reuse a mature non-interactive CLI interface.

| Option | Executed interface | Authentication | Structured output | Status |
| --- | --- | --- | --- | --- |
| Codex CLI | `codex exec` | ChatGPT/Codex login; OpenAI API key optional | Native `--output-schema` | Default and most stable |
| Claude Code | `claude -p` | Claude Pro/Max or Anthropic Console | `--output-format json` + `--json-schema` | Supported |
| Gemini | `agy -p` | Google login | `--output-format json` + `--json-schema` | Uses Antigravity CLI |
| Qwen Code | `qwen` via stdin | Coding Plan, ModelStudio key, or configured provider | `--output-format json` + `--json-schema` | Supported; legacy Qwen OAuth unavailable |
| Ollama | Local `/api/chat` | Local model; no cloud key | Native API JSON Schema | Supported; model name required |
| GLM Coding Plan | `claude -p` | Z.AI Coding Plan credentials | Reuses Claude Code structured output | Compatible endpoint supported |
| DeepSeek | `claude -p` | DeepSeek API key | Reuses Claude Code structured output | Compatible endpoint supported |

Important distinctions:

- Claude Code supports Claude Pro/Max authentication and non-interactive JSON Schema output, making it suitable for a local bridge. See [Claude Code setup](https://docs.anthropic.com/en/docs/claude-code/getting-started) and the [CLI reference](https://code.claude.com/docs/en/cli-usage).
- Google's personal-account terminal flow has moved to Antigravity CLI. This project uses `agy` instead of treating the legacy `gemini` command as the default personal-account entry point. See the [migration announcement](https://github.com/google-gemini/gemini-cli/discussions/28017) and [Antigravity CLI](https://github.com/google-antigravity/antigravity-cli).
- Qwen Code supports stdin, headless JSON output, and JSON Schema. The Qwen OAuth free tier ended on 2026-04-15, so new setups should use Coding Plan, ModelStudio, or another configured provider. See [headless mode](https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/) and [authentication](https://qwenlm.github.io/qwen-code-docs/en/users/configuration/auth/).
- Ollama exposes a local API at `http://localhost:11434` on Windows. The bridge accesses only the loopback address and passes a JSON Schema to `/api/chat`. See [Ollama for Windows](https://docs.ollama.com/windows) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).
- GLM Coding Plan is not a credential-free CLI. It requires a supported tool, the Z.AI Coding Plan endpoint, and plan credentials. See [GLM Coding Plan Quick Start](https://docs.z.ai/devpack/quick-start).
- DeepSeek currently requires a DeepSeek API key for its official Claude Code or Codex-compatible integrations. See the [Claude Code integration](https://api-docs.deepseek.com/quick_start/agent_integrations/claude_code/) and [Codex integration](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/).

If avoiding the purchase of a model API key is the priority, use Codex CLI with an existing ChatGPT/Codex subscription, Ollama for a fully local workflow, Claude Code with an existing Claude Pro/Max subscription, or Antigravity CLI with an eligible Google account. Qwen Code, GLM, and DeepSeek still require an existing plan, provider, or API key.

### Possible Next Adapter

**OpenCode** is a candidate for a general provider-routing layer. `opencode run --format json` offers non-interactive event output and supports many providers, but it does not currently provide the same explicit final JSON Schema contract as Codex or Qwen Code. It would require event aggregation and stricter result validation. See the [OpenCode CLI](https://opencode.ai/docs/cli/) and [provider documentation](https://opencode.ai/docs/providers/).

### Claude Code

```powershell
npm install -g @anthropic-ai/claude-code
claude
claude auth status
npm run bridge
```

Select **Claude Code** in the extension settings and check the connection.

### Gemini / Antigravity CLI

Follow the [official Antigravity CLI instructions](https://github.com/google-antigravity/antigravity-cli), run `agy`, and complete the Google sign-in flow. Select **Gemini · Antigravity CLI** in the extension settings. Review any remote installation script before executing it.

### Qwen Code

```powershell
npm install -g @qwen-code/qwen-code@latest
qwen
qwen --version
npm run bridge
```

Inside the first interactive session, enter `/auth` and choose Alibaba Cloud Coding Plan, ModelStudio, or an existing third-party provider. Do not follow old instructions that select Qwen OAuth; its free tier has ended. The bridge sends prompts through stdin and enables safe mode, zero ordinary tool calls, and JSON Schema output.

### Ollama

Install Ollama using the [official Windows instructions](https://docs.ollama.com/windows), then download an instruction model appropriate for the machine and target languages:

```powershell
ollama pull <model-name>
ollama ls
npm run bridge
```

Select **Ollama local model** in the extension settings and enter the model name exactly as shown by `ollama ls`. The bridge is fixed to `127.0.0.1:11434` and does not expose Ollama to the local network. Model files may require several to tens of gigabytes of disk space.

### GLM and DeepSeek

Both modes use Claude Code as the non-interactive CLI shell. Configure the provider endpoint and credentials locally according to the official integration documentation, then run `npm run bridge` from the same terminal environment. The bridge does not read or store credentials; it only inherits the CLI configuration or process environment.

## Usage

1. Select text inside a single-line input or textarea on a web page.
2. Open the jeffrey-type-transfer side panel and wait for **Selection locked**.
3. Choose the target language and tone.
4. Click **Translate and replace selected text**, or press `Alt + Shift + T`.
5. Select part of the source text in the bilingual comparison to highlight the aligned translation.

To avoid changing passwords or unsupported editors, the extension handles only `text`, `search`, `url`, `tel`, and `email` inputs plus ordinary textareas. Password fields and rich-text editors are intentionally excluded.

## Optional API-Key Mode

An API key is not required for the default workflow. To use a direct model API, switch to **API Key** in settings and provide:

- API base URL
- Responses API or Chat Completions protocol
- Model name
- API key

A custom HTTPS base URL triggers a browser permission request for that origin. The key is stored in `chrome.storage.local` and never written to the repository, but browser local storage is not a dedicated secrets vault. Use this mode only on a trusted personal device.

## Local Bridge Architecture

Browser extensions cannot execute local processes directly, so the project includes a small loopback-only HTTP bridge:

```text
Browser side panel -> http://127.0.0.1:8989 -> selected CLI/local runtime -> translation
```

The default Codex adapter runs:

```text
codex exec --ephemeral --skip-git-repo-check --sandbox read-only --output-schema bridge/translation-schema.json -
```

Claude Code uses `claude -p --output-format json --json-schema ... --tools ""`; Antigravity uses `agy -p --output-format json --json-schema ...`; Qwen Code uses stdin, safe mode, a zero ordinary-tool budget, and JSON Schema; Ollama uses structured output through the local `/api/chat` endpoint.

Prompts are passed without a shell. Structured output contains both the complete translation and aligned semantic segments. The service exposes only `/health` and `/translate`, allows at most two concurrent translation jobs, and limits request and source-text sizes.

## Development

```powershell
npm run dev       # Preview at http://127.0.0.1:5173
npm run bridge    # Start the local model bridge
npm run check     # Run TypeScript checks
npm run build     # Generate the loadable dist extension
```

The ordinary web preview can verify the side-panel interface and bilingual highlighting. Context menus, shortcuts, page-selection capture, and in-place replacement must be tested with the unpacked extension loaded in Chrome or Edge. Open `http://127.0.0.1:5173/?empty=1` to preview the disabled no-selection state.

## Project Structure

```text
bridge/server.mjs          Multi-model CLI adapters and local bridge
public/manifest.json       Chromium MV3 manifest
src/background.ts          Context menu, shortcut, translation, and replacement jobs
src/components/            Translation and settings interfaces
src/lib/                   Page selection, storage, and model integrations
design/                    Visual design references
dist/                      Loadable extension build output
```

## Security

- Never add `~/.codex/auth.json`, API keys, or access tokens to Git, chat messages, or error logs.
- Never bind the bridge to `0.0.0.0` or expose port `8989` to the public internet.
- The Codex adapter explicitly uses a read-only sandbox. The Claude Code adapter disables built-in tools. Antigravity relies on its local permission policy and receives an explicit no-tools translation prompt.
- The Qwen Code adapter enables safe mode and limits ordinary tool calls to zero. The Ollama adapter accesses only `127.0.0.1:11434`.
- GLM and DeepSeek credentials should exist only in official provider tools, local CLI configuration, or the bridge process environment.
- Page text is sent to the selected model provider unless Ollama is used locally. Do not translate content that must not leave the applicable device or account boundary.
