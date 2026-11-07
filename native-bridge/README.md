# Codex 本机 HTTP 桥接

`start-bridge.cmd` 只在需要时发起 Codex 设备登录，然后启动 PowerShell 5 兼容的 `server.ps1`。服务固定绑定 `http://127.0.0.1:47321`。

## 接口

- `GET /health`：需要 `Authorization: Bearer <token>`，返回 `ok`、`codexInstalled`、`loggedIn` 和 `codexVersion`。
- `GET /bootstrap-token`：仅用于扩展首次配对。必须有浏览器提供的 `chrome-extension://` 或 `edge-extension://` Origin，并在 `X-Bridge-Extension-Id` 中提交同一个 ID；它会把第一个成功的 ID 保存到 `.bridge-extension-id`，随后拒绝其他扩展 ID。成功时返回令牌。
- `GET /models`：需要 Bearer 认证，返回桥接内置的当前 Codex 推荐模型候选和“使用默认模型”选项。候选并非账号权限清单；实际模型可用性仍由已登录 Codex CLI 在执行时判定。
- `POST /execute`：需要 Bearer 认证和 `application/json`。请求包含 `prompt`、可选 PNG/JPEG Data URL `screenshot` 与受格式限制的可选 `model`；成功返回 `{ "ok": true, "decision": { "action": "replace_text", "translation": "..." } }`。

`OPTIONS` 仅用于浏览器 CORS 预检：它不执行任何业务接口，也不携带可被利用的敏感结果；`/health` 和 `/execute` 始终要求 Bearer 令牌。`/bootstrap-token` 是为避免人工复制令牌而刻意保留的、受扩展 Origin/ID 绑定限制的唯一引导例外。

## 令牌与维护

首次运行会生成 32 字节随机 Base64URL 令牌并保存至 `.bridge-token`。后续启动复用该文件；它不会在日志、错误响应或提示词中出现，并已在项目 `.gitignore` 中排除。首次“获取令牌”也会写入 `.bridge-extension-id`；需要绑定不同扩展 ID 或轮换令牌时，停止桥接、删除对应文件、重新启动，再在扩展中点击“获取令牌”。

`response-schema.json` 是 Codex 的最终输出契约；PowerShell 和扩展会再次验证 `action` 和 `translation`，不信任模型输出直接执行操作。
