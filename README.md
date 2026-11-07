# Jeffrey Type Transfer

无需构建的 Chrome/Edge 扩展：将网页可编辑区域中选定的文字交给已登录的 Codex CLI 翻译，再由扩展在当前选区内替换。默认通道为：浏览器扩展 → `127.0.0.1` HTTP 桥接 → Codex CLI。

## 安装与启动

1. 安装并登录 Codex CLI。首次启动桥接会自动检查登录；只有未登录或登录失效时才显示设备登录。
2. 双击或在项目根目录运行 `native-bridge\start-bridge.cmd`。它只监听 `http://127.0.0.1:47321`，窗口须保持运行。
3. 桥接首次启动会在 `native-bridge\.bridge-token` 生成长期随机令牌。扩展设置中点击“获取令牌”即可自动取得它；首次请求会永久绑定当前扩展 ID。令牌文件已被 Git 忽略。
4. 在 Chrome/Edge 的扩展管理页开启开发者模式，选择“加载已解压的扩展”，选择本项目根目录。
5. 打开扩展侧边栏，填写桥接地址、令牌和（可选）模型名称，点击“验证连接”。验证成功前不会进入翻译页。

可选模型处可点击“获取模型”载入桥接推荐候选，再通过下拉菜单选择。候选列表不代表该登录账号一定有权限，Codex CLI 会在实际执行时验证。

重启电脑后，只需再次运行 `native-bridge\start-bridge.cmd`；令牌和 Codex CLI 登录由各自本机存储持续保留。登录失效时，启动脚本才会进入设备登录。

## 工作方式与安全边界

- 扩展只把请求发送到固定的回环地址 `127.0.0.1:47321`，每次请求都发送 Bearer 令牌。
- 桥接拒绝非 Chrome/Edge 扩展的跨域来源、缺少令牌、非 JSON 请求、超大请求和非 PNG/JPEG 截图。
- 每一次模型调用都固定为 `codex exec --ignore-user-config --skip-git-repo-check --ephemeral --sandbox read-only`，提示词通过标准输入传递。扩展无法选择可执行文件、工作目录、sandbox 或命令参数。
- Codex 只能返回 `replace_text` 决定和文本；真正的替换仍由扩展对已选中的可编辑区域执行。桥接和扩展都会验证 JSON 结构。
- 截图与结果文件仅写入独立系统临时目录，并在成功、失败或超时后删除。桥接不会向浏览器返回原始 stderr、凭据或内部路径。
- `--ignore-user-config` 防止加载用户自定义 MCP/插件配置，但继续使用 Codex 已有登录认证。

## 故障排查

- “未找到 Codex CLI”：在新的 PowerShell 窗口执行 `where codex`；安装后重新运行启动脚本。
- “尚未登录”：重新运行 `native-bridge\start-bridge.cmd` 并完成设备登录，不要把登录信息粘贴到扩展或聊天中。
- “桥接令牌无效”：在同一扩展中再次点击“获取令牌”；不要删除 `.bridge-token`，除非要轮换令牌（删除后重启桥接会生成新令牌）。如需更换浏览器配置文件或扩展 ID，也请一并删除 `.bridge-extension-id` 后重新启动桥接。
- “无法连接”：确认桥接窗口仍在运行，地址为 `http://127.0.0.1:47321`，且没有其他服务占用该端口。
- “Codex 执行超时”：本次子进程已被终止；缩短文本或检查登录/模型可用性后重试。

可选的 API Key 模式仍保留为未来 provider 接口，默认不会使用它。

## 验证

运行 `npm run check` 和 `npm test` 可检查扩展原生文件及 JavaScript 测试。PowerShell 静态语法检查：

```powershell
[System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path .\native-bridge\server.ps1), [ref]$null, [ref]$errors); $errors
```

详细桥接接口见 [native-bridge/README.md](native-bridge/README.md)。
