import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("PowerShell 桥接固定使用回环地址、Bearer 令牌与 read-only Codex", async () => {
  const source = await readFile(new URL("../native-bridge/server.ps1", import.meta.url), "utf8");
  assert.match(source, /http:\/\/127\.0\.0\.1:\$Port\//);
  assert.match(source, /RandomNumberGenerator/);
  assert.match(source, /Get-Command codex\.exe/);
  assert.match(source, /Get-Command codex/);
  assert.match(source, /\.ps1\$/);
  assert.match(source, /Authorization/);
  assert.match(source, /bootstrap-token/);
  assert.match(source, /X-Bridge-Extension-Id/);
  assert.match(source, /AllowedExtensionPath/);
  assert.match(source, /--ignore-user-config/);
  assert.match(source, /--sandbox', 'read-only/);
  assert.match(source, /--output-last-message/);
  assert.match(source, /RecommendedModels/);
  assert.match(source, /AbsolutePath -eq '\/models'/);
  assert.match(source, /\$process\.Kill\(\)/);
  assert.match(source, /Remove-Item -LiteralPath \$tempDir -Recurse -Force/);
  assert.doesNotMatch(source, /dangerously-bypass-approvals-and-sandbox/);
});

test("启动脚本只在登录状态失败时执行设备登录", async () => {
  const source = await readFile(new URL("../native-bridge/start-bridge.cmd", import.meta.url), "utf8");
  assert.match(source, /Get-Command codex -ErrorAction SilentlyContinue/);
  assert.match(source, /codex login status/);
  assert.match(source, /if errorlevel 1 \(\s*echo Codex is not logged in[\s\S]*codex login --device-auth/);
  assert.match(source, /server\.ps1/);
});

test("扩展使用令牌验证 HTTP 桥接并在连接前锁定翻译", async () => {
  const [manifest, panel, client] = await Promise.all([
    readFile(new URL("../manifest.json", import.meta.url), "utf8"),
    readFile(new URL("../sidepanel.js", import.meta.url), "utf8"),
    readFile(new URL("../translate.js", import.meta.url), "utf8"),
  ]);
  assert.match(manifest, /"storage"/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1\/\*/);
  assert.doesNotMatch(manifest, /nativeMessaging/);
  assert.match(panel, /id="bridge-token"/);
  assert.match(panel, /verifyBridgeConnection/);
  assert.match(panel, /state\.view = isConnectionReady\(config\) \? "translator" : "settings"/);
  assert.match(client, /export async function fetchWithTimeout/);
  assert.match(client, /export async function readJsonResponse/);
  assert.match(client, /export async function callCodexBridge/);
  assert.match(client, /export async function requestBridgeToken/);
  assert.match(client, /export async function fetchBridgeModels/);
  assert.match(client, /Authorization: `Bearer \$\{bridgeToken\(config\)\}`/);
});

test("结构化输出契约不允许额外字段", async () => {
  const schema = JSON.parse(await readFile(new URL("../native-bridge/response-schema.json", import.meta.url), "utf8"));
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["action", "translation"]);
  assert.deepEqual(schema.properties.action.enum, ["replace_text"]);
});

test("AI 未连接时配置页会阻止返回翻译", async () => {
  const source = await readFile(new URL("../sidepanel.js", import.meta.url), "utf8");
  assert.match(source, /nextView === "translator" && !isConnectionReady\(\)/);
  assert.match(source, /连接成功后即可返回翻译/);
});
