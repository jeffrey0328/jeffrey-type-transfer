# Jeffrey Type Transfer

**English** | [简体中文](README.zh-CN.md)

Jeffrey Type Transfer is a build-free Chrome/Edge extension. It sends selected text from an editable web page field to a locally signed-in Codex CLI for translation, then replaces the selection in place. The default route is extension → loopback HTTP bridge → Codex CLI.

## Setup

1. Install and sign in to Codex CLI. The bridge startup script checks the login and starts device login only when needed.
2. Run `native-bridge\start-bridge.cmd` from the project root and leave its window open. The bridge listens on `http://127.0.0.1:47321`.
3. On first launch, the bridge creates a random long-lived token in `native-bridge\.bridge-token`. In the extension settings, click **Get token** to pair the current extension ID and save the token locally. Both pairing files are ignored by Git.
4. In Chrome or Edge, enable Developer mode on the extensions page and choose **Load unpacked**. Select this project root, which contains `manifest.json`.
5. Open the extension side panel and click **Check connection**. The translation view remains locked until the connection succeeds.

The optional model list contains bridge suggestions, not a guarantee that your account can use each model. Codex CLI checks availability when it executes a request. After restarting your computer, run `native-bridge\start-bridge.cmd` again; the token and Codex login remain in their respective local stores.

## How it works

- The extension accepts only an `http://127.0.0.1` bridge URL. The bridge binds to port 47321 by default. Requests to its protected endpoints carry a Bearer token.
- The bridge checks extension origins for browser requests, authentication, JSON payloads, request size, and PNG/JPEG screenshot data.
- Every model call uses fixed `codex exec --ignore-user-config --skip-git-repo-check --ephemeral --sandbox read-only` options. The prompt goes through standard input. The extension cannot select an executable, working directory, sandbox, or arbitrary CLI option.
- Codex returns only a structured `replace_text` decision and translation. The extension performs the actual replacement in the selected editable field. Both layers validate the decision.
- Screenshots and results use an isolated system temporary directory that is removed after success, failure, or timeout. The bridge does not return raw stderr, credentials, or internal paths to the browser.
- `--ignore-user-config` prevents loading custom MCP and plugin configuration while retaining the existing Codex login.

## Troubleshooting

- **Codex CLI not found:** Run `Get-Command codex` in a new PowerShell window. Install the CLI if needed, then restart the bridge.
- **Not signed in:** Run `native-bridge\start-bridge.cmd` again and complete device login. Do not paste login details into the extension or a chat.
- **Invalid bridge token:** Click **Get token** again in the same extension. To rotate the token, stop the bridge, delete `.bridge-token`, and restart. If the extension ID changed, also delete `.bridge-extension-id` before restarting.
- **Cannot connect:** Keep the bridge window open and confirm that `http://127.0.0.1:47321` is available.
- **Codex timeout:** The child process has been stopped. Try shorter text or check login and model availability.

An optional API key mode remains available for compatible providers and is not used by default.

## Validation

Run `npm run check` and `npm test` for the extension and JavaScript tests. To check PowerShell syntax:

```powershell
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\native-bridge\server.ps1), [ref]$null, [ref]$errors); $errors
```

See the [bridge interface documentation](native-bridge/README.md) for its endpoints and token lifecycle.
