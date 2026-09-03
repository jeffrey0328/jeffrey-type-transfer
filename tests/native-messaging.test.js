import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  NATIVE_BRIDGE_START_MESSAGE,
  NATIVE_HOST_NAME,
  describeNativeHostError,
  startNativeBridge,
} from "../native-bridge.js";

test("Native Messaging 使用固定宿主名和启动消息", () => {
  assert.equal(NATIVE_HOST_NAME, "com.jeffrey.type_transfer.bridge");
  assert.equal(NATIVE_BRIDGE_START_MESSAGE, "jeffrey-native-bridge-start");
});

test("未注册宿主时返回可操作的错误", async () => {
  const chromeApi = {
    runtime: {
      lastError: null,
      sendNativeMessage(name, message, callback) {
        assert.equal(name, NATIVE_HOST_NAME);
        assert.deepEqual(message, { action: "start" });
        this.lastError = { message: "Specified native messaging host not found." };
        callback(undefined);
        this.lastError = null;
      },
    },
  };

  const result = await startNativeBridge(chromeApi);
  assert.equal(result.ok, false);
  assert.equal(result.code, "native-host-not-installed");
  assert.match(result.message, /install\.ps1/);
});

test("宿主成功响应会保留启动状态", async () => {
  const chromeApi = {
    runtime: {
      lastError: null,
      sendNativeMessage(_name, _message, callback) {
        callback({ ok: true, started: true, message: "本地桥接已启动" });
      },
    },
  };

  const result = await startNativeBridge(chromeApi);
  assert.deepEqual(result, {
    ok: true,
    started: true,
    alreadyRunning: false,
    message: "本地桥接已启动",
  });
});

test("宿主错误不会把浏览器底层错误原样暴露给界面", () => {
  const result = describeNativeHostError("Unexpected native transport detail");
  assert.equal(result.code, "native-host-error");
  assert.doesNotMatch(result.message, /transport detail/i);
});

test("Windows 注册脚本只使用当前用户注册表并固定允许的扩展来源", async () => {
  const source = await readFile(new URL("../native-host/install.ps1", import.meta.url), "utf8");
  assert.match(source, /HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts/);
  assert.match(source, /HKCU:\\Software\\Microsoft\\Edge\\NativeMessagingHosts/);
  assert.match(source, /chrome-extension:\/\/\$ExtensionId\//);
  assert.match(source, /cliPaths = \[ordered\]@\{/);
  assert.match(source, /Get-Command \$Name -CommandType Application/);
  assert.match(source, /Native Messaging 注册校验失败/);
  assert.doesNotMatch(source, /HKLM:/);
});

test("本机宿主固定回环地址和端口，且不接受外部命令路径", async () => {
  const source = await readFile(
    new URL("../native-host/JeffreyTypeTransfer.NativeHost.cs", import.meta.url),
    "utf8",
  );
  assert.match(source, /127\.0\.0\.1:8989/);
  assert.match(source, /QuoteArgument\(serverPath\) \+ " --native-launch"/);
  assert.match(source, /UseShellExecute = true/);
  assert.match(source, /WindowStyle = ProcessWindowStyle\.Hidden/);
  assert.doesNotMatch(source, /RedirectStandard(Output|Error) = true/);
  assert.doesNotMatch(source, /request\.(Path|Command|Arguments)/);
});

test("本机启动时桥接不保留 Native Messaging 标准流", async () => {
  const source = await readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8");
  assert.match(source, /process\.argv\.includes\("--native-launch"\)/);
  assert.match(source, /NATIVE_LAUNCH \? "127\.0\.0\.1"/);
  assert.match(source, /NATIVE_LAUNCH \? 8989/);
  assert.match(source, /process\.stdin\.destroy\(\)/);
  assert.match(source, /process\.stdout\.destroy\(\)/);
  assert.match(source, /process\.stderr\.destroy\(\)/);
  assert.match(source, /NATIVE_CLI_PATHS\.codex/);
  assert.match(source, /jeffrey-type-transfer-schema-\$\{process\.pid\}\.json/);
  assert.match(source, /--output-schema", RUNTIME_OUTPUT_SCHEMA_PATH/);
});

test("新旧侧栏都能接收精简后的翻译结果", async () => {
  const [bridge, client] = await Promise.all([
    readFile(new URL("../bridge/server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../translate.js", import.meta.url), "utf8"),
  ]);
  assert.match(client, /clientProtocol: 2/);
  assert.match(bridge, /if \(clientProtocol === 2\) return result/);
  assert.match(bridge, /segments: \[\{ source: text, target: result\.translation \}\]/);
});

test("复制注册命令后保留首次使用展开状态", async () => {
  const source = await readFile(new URL("../sidepanel.js", import.meta.url), "utf8");
  assert.match(source, /nativeSetupOpen: false/);
  assert.match(source, /state\.nativeSetupOpen \? "open" : ""/);
  assert.match(source, /state\.nativeSetupOpen = event\.currentTarget\.open/);
});

test("Codex 登录助手使用注册时记录的 CLI 路径", async () => {
  const [script, config] = await Promise.all([
    readFile(new URL("../native-host/codex-login.ps1", import.meta.url), "utf8"),
    readFile(new URL("../app-config.js", import.meta.url), "utf8"),
  ]);
  assert.match(script, /host-config\.json/);
  assert.match(script, /\$config\.cliPaths\.codex/);
  assert.doesNotMatch(script, /auth\.json|API[_ ]?Key/i);
  assert.match(config, /native-host\\\\codex-login\.ps1/);
});

test("AI 未连接时配置页会阻止返回翻译并使用滑动切换", async () => {
  const source = await readFile(new URL("../sidepanel.js", import.meta.url), "utf8");
  assert.match(source, /state\.view = isConnectionReady\(config\) \? "translator" : "settings"/);
  assert.match(source, /nextView === "translator" && !isConnectionReady\(\)/);
  assert.match(source, /outgoing\.animate\(/);
  assert.match(source, /incoming\.animate\(/);
  assert.match(source, /连接成功后即可返回翻译/);
});

test("主流程只保留选中翻译", async () => {
  const sources = await Promise.all([
    readFile(new URL("../app-config.js", import.meta.url), "utf8"),
    readFile(new URL("../selection-tracker.js", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.js", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.css", import.meta.url), "utf8"),
  ]);
  const runtime = sources.join("\n");
  assert.doesNotMatch(runtime, /liveTranslation|yuqiao-live|实时翻译/);
  assert.match(runtime, /翻译并替换选中内容/);
});
