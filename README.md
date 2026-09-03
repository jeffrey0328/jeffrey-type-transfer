# jeffrey-type-transfer

**English** | [简体中文](./README.zh-CN.md)

jeffrey-type-transfer is a Chromium MV3 side-panel translation extension. Select text inside a web page input, choose a target language, and replace the selection in place with an LLM-generated translation.

The default connection is the local **Codex CLI**, so an existing ChatGPT/Codex login can be used without purchasing an OpenAI API key. Claude Code, Gemini/Antigravity CLI, Qwen Code, Ollama, GLM, DeepSeek, and optional API-key connections are also supported.

## Features

- Continuously recognizes selected text in searches, inputs, comments, mail replies, and other editable regions, including same-page frames
- Detects the source language and translates into 12 common target languages
- Natural, formal, concise, and conversational tones
- Uses Codex CLI by default; no OpenAI API key is required
- Supports Claude Code, Gemini/Antigravity CLI, Qwen Code, Ollama, GLM Coding Plan, and DeepSeek-compatible connections
- Optionally supports Responses API and compatible Chat Completions services
- Replaces the selected page text through the side panel, context menu, or `Alt + Shift + T`
- Checks the saved AI connection when the side panel opens and keeps setup locked until the connection is ready
- Switches between translation and setup with a horizontal card transition
- Provides both written setup instructions and a ready-to-use Agent configuration prompt

## Quick Start: Codex CLI

The recommended path is to let a coding Agent prepare and verify the local environment. Both setup modes use your ChatGPT/Codex login and do not require an OpenAI API key.

### Option A (Recommended): Agent-Assisted Setup

Open Codex or another coding Agent in this project directory, then copy the prompt below:

```text
Set up the jeffrey-type-transfer browser extension in the current project directory. Use Codex CLI as the default model connection and do not create or request an OpenAI API key.

Please complete the following work:
1. Inspect the project requirements, Node.js version, npm availability, and whether Codex CLI is already installed. Start with read-only checks. Do not inspect or enumerate the Codex home directory or any credential file.
2. Do not initialize or reinitialize Git. If `.git` is missing, continue without running `git init`. Do not modify Git configuration or repository metadata as part of setup.
3. If Codex CLI is missing, show me the exact global installation command and ask for confirmation immediately before running it. Use: npm install -g @openai/codex
4. Run `codex login status` to check the login. If login is required, explain that `codex login` opens a browser and ask for confirmation before running it. After it starts, pause and let me complete browser sign-in myself. Continue only after I confirm that sign-in is complete.
5. Run `npm run check` and `npm test`. The frontend has no dependencies, so no `npm install` or build is required.
6. Start `npm run bridge` on `127.0.0.1:8989`, then request `http://127.0.0.1:8989/health?provider=codex` and confirm that installed=true and ready=true.
7. Tell me how to select the current project root directly in Chrome or Edge's **Load unpacked** screen. Do not install the browser extension or approve browser permissions on my behalf.

Failure handling:
- If a command cannot start and Codex reports `helper_unknown_error: setup refresh had errors`, stop retrying ordinary commands. On Windows, inspect only the non-secret diagnostics needed to determine whether the project directory and `.git` have mismatched owners or ACLs, then report the exact failing path and error.
- If `.git` is owned by a Codex sandbox account, explain that repairing it may require an Administrator PowerShell. Show narrowly scoped `takeown` and `icacls` commands for this repository's exact `.git` path, but do not execute them until I approve. Never delete `.git`.
- Do not repeatedly rerun ordinary project commands outside the sandbox as a workaround. Do not change file ownership, ACLs, sandbox mode, or run an elevated repair command without showing the exact proposed command and receiving my explicit approval.
- If permissions are repaired, ask me to restart Codex and confirm that the project has been reopened before continuing from the failed step.

Safety rules:
- Do not read, print, copy, or modify Codex credential files such as `~/.codex/auth.json`.
- Do not request, generate, or store any API key or access token.
- Do not bind the bridge to `0.0.0.0` or expose port 8989 outside this device.
- Do not run `git init`, modify `.git`, change repository ownership or ACLs, edit unrelated files, push to Git, or publish anything.
- Stop and ask me before any global software installation, account login, ownership or ACL change, sandbox-mode change, elevated command, or other action that requires my approval.
```

After the Agent finishes, load the current project root in Chrome or Edge and click **Check connection** in the extension settings.

If Codex reports `helper_unknown_error: setup refresh had errors` on Windows, do not delete `.git`. A repository ownership or ACL mismatch can prevent the Windows sandbox from preparing its access rules. Review the Agent's exact diagnosis, approve only a narrowly scoped permission repair if appropriate, restart Codex, and run the prompt again. See the official [Windows sandbox documentation](https://learn.chatgpt.com/docs/windows/windows-sandbox).

### Option B: Manual Setup

#### 1. Install and sign in to Codex CLI

```powershell
npm install -g @openai/codex
codex login
```

`codex login` opens a browser. Sign in with a ChatGPT account that has Codex access, then verify the session:

```powershell
codex login status
```

Codex CLI supports ChatGPT subscription authentication. See [Codex authentication](https://learn.chatgpt.com/docs/auth).

#### 2. Start the local bridge

```powershell
npm run bridge
```

The bridge listens only on `127.0.0.1:8989`. Keep this terminal running.

You can also use the extension's **One-click start** without keeping a terminal window open. Native Messaging requires a one-time local host registration:

1. Open `chrome://extensions` or `edge://extensions`, find Jeffrey Type Transfer, and copy its extension ID.
2. From the project root, run the following once, replacing `<extension ID>` with the actual value:

```powershell
powershell -ExecutionPolicy Bypass -File .\native-host\install.ps1 -ExtensionId <extension ID> -Browser Both
```

3. Reload the unpacked extension, open **Connection & Settings**, and select **One-click start**.

The installer uses per-user Chrome/Edge registry entries and does not require administrator privileges. It compiles a small native host from the source in this repository. The host only accepts a fixed `start` action, launches this project's `bridge/server.mjs`, and forces `127.0.0.1:8989`. It does not read Codex credentials and cannot accept arbitrary commands, paths, hosts, or ports from the extension.
The installer also records model CLI executable paths visible in the current terminal so a browser-launched bridge does not lose them with a different `PATH`. Run the registration command again if a CLI upgrade moves its executable.
If a regular PowerShell session cannot resolve `codex`, run `powershell -ExecutionPolicy Bypass -File .\native-host\codex-login.ps1` from the project root; the helper uses the executable path captured during registration.

To remove the registration:

```powershell
powershell -ExecutionPolicy Bypass -File .\native-host\uninstall.ps1 -Browser Both
```

#### 3. Load it in Chrome or Edge (no build required)

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select this project root directly (the directory containing the root `manifest.json`).
5. Click **Jeffrey Type Transfer** in the browser toolbar to open the side panel.
6. Open **Connection & Settings** and click **One-click start** or **Check connection**. After source changes, reload the extension; no build is required.

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

1. Select text inside a search box, input, comment box, mail reply, or another editable region.
2. Open the jeffrey-type-transfer side panel and wait for **Selection locked**.
3. Choose the target language and tone.
4. Click **Translate and replace selected text**, or press `Alt + Shift + T`.

The extension continuously stores the last valid editable selection in the page and its frames, so opening the side panel does not lose it. Selection translation handles inputs for which the browser exposes text selection, ordinary textareas, `contenteditable`, and `designMode` editors. Password fields are always excluded. Canvas editors such as Google Docs, closed shadow roots, and editors whose state is fully detached from the DOM can still prevent in-place replacement.

## Optional API-Key Mode

An API key is not required for the default workflow. To use a direct model API, switch to **API Key** in settings and provide:

- API base URL
- Responses API or Chat Completions protocol
- Model name
- API key

Continuous recognition in search, comment, and mail editors requires read access to HTTP/HTTPS pages and their frames when the extension is installed. Text is sent to the selected model service only after you explicitly start a translation. The key is stored in `chrome.storage.local` and never written to the repository, but browser local storage is not a dedicated secrets vault. Use this mode only on a trusted personal device.

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

Prompts are passed without a shell. Structured output contains the complete translation. The service exposes only `/health` and `/translate`, allows at most two concurrent translation jobs, and limits request and source-text sizes.

## Development

```powershell
npm run dev       # Preview at http://127.0.0.1:5173
npm run bridge    # Start the local model bridge
npm run check     # Check manifest, runtime files, and JavaScript syntax
npm test          # Run Node.js unit tests
```

The ordinary web preview can verify the side-panel interface and its selection states. Context menus, shortcuts, page-selection capture, and in-place replacement must be tested with the project root loaded as an unpacked extension in Chrome or Edge. After source changes, reload the extension without building. Open `http://127.0.0.1:5173/?empty=1` to preview the disabled no-selection state.

## Project Structure

```text
manifest.json              Chromium MV3 manifest; load the project root directly
background.js              Context menu, shortcut, translation, and replacement jobs
sidepanel.html/js/css      Native side-panel and settings interface
app-config.js              Providers, languages, and default configuration
page-selection.js          Page selection capture and replacement
selection-tracker.js       Persistent editable-selection tracking across pages and frames
storage.js                 Browser configuration and task state
translate.js               CLI bridge and API requests
bridge/server.mjs          Multi-model CLI adapters and local bridge
native-bridge.js           Native Messaging invocation used by the extension background
native-host/               Windows native host source and Chrome/Edge registration scripts
scripts/                   Dependency-free preview and checks
tests/                     Node.js unit tests
design/                    Visual design references
```

## Security

- Never add `~/.codex/auth.json`, API keys, or access tokens to Git, chat messages, or error logs.
- Never bind the bridge to `0.0.0.0` or expose port `8989` to the public internet.
- The Codex adapter explicitly uses a read-only sandbox. The Claude Code adapter disables built-in tools. Antigravity relies on its local permission policy and receives an explicit no-tools translation prompt.
- The Qwen Code adapter enables safe mode and limits ordinary tool calls to zero. The Ollama adapter accesses only `127.0.0.1:11434`.
- GLM and DeepSeek credentials should exist only in official provider tools, local CLI configuration, or the bridge process environment.
- Page text is sent to the selected model provider unless Ollama is used locally. Do not translate content that must not leave the applicable device or account boundary.
