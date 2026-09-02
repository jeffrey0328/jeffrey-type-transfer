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
  assert.doesNotMatch(source, /HKLM:/);
});

test("本机宿主固定回环地址和端口，且不接受外部命令路径", async () => {
  const source = await readFile(
    new URL("../native-host/JeffreyTypeTransfer.NativeHost.cs", import.meta.url),
    "utf8",
  );
  assert.match(source, /127\.0\.0\.1:8989/);
  assert.match(source, /\[\"YUQIAO_HOST"\] = "127\.0\.0\.1"/);
  assert.match(source, /\[\"YUQIAO_PORT"\] = "8989"/);
  assert.doesNotMatch(source, /request\.(Path|Command|Arguments)/);
});
