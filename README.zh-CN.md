# Jeffrey Type Transfer 中文说明

请阅读项目主文档：[README.md](README.md)。当前默认接入已经是“浏览器扩展 → `127.0.0.1:47321` PowerShell HTTP 桥接 → 已登录 Codex CLI”，不再使用 Native Messaging 或 `npm run bridge`。

首次运行 `native-bridge\start-bridge.cmd`，在扩展设置点击“获取令牌”即可自动绑定当前扩展 ID、保存令牌并验证连接。桥接只接受回环请求、固定的 read-only Codex CLI 参数和结构化 `replace_text` 决定。

接口、令牌轮换与安全细节见 [native-bridge/README.md](native-bridge/README.md)。
