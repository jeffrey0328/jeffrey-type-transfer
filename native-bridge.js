// @ts-check

export const NATIVE_HOST_NAME = "com.jeffrey.type_transfer.bridge";
export const NATIVE_BRIDGE_START_MESSAGE = "jeffrey-native-bridge-start";

export function describeNativeHostError(message = "") {
  const normalized = message.toLowerCase();
  if (normalized.includes("host not found") || normalized.includes("not found")) {
    return {
      code: "native-host-not-installed",
      message: "尚未安装本机桥接助手，请先运行 native-host/install.ps1 完成一次性注册",
    };
  }
  if (normalized.includes("forbidden") || normalized.includes("not allowed")) {
    return {
      code: "native-host-forbidden",
      message: "本机桥接助手未授权当前扩展 ID，请重新运行注册脚本",
    };
  }
  return {
    code: "native-host-error",
    message: "无法调用本机桥接助手，请检查 Native Messaging 注册状态",
  };
}

export function startNativeBridge(chromeApi) {
  return new Promise((resolve) => {
    chromeApi.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      { action: "start" },
      (response) => {
        const runtimeError = chromeApi.runtime.lastError;
        if (runtimeError) {
          resolve({ ok: false, ...describeNativeHostError(runtimeError.message) });
          return;
        }
        if (!response || response.ok !== true) {
          resolve({
            ok: false,
            code: typeof response?.code === "string" ? response.code : "native-host-error",
            message: typeof response?.message === "string"
              ? response.message
              : "本机桥接助手没有返回有效响应",
          });
          return;
        }
        resolve({
          ok: true,
          started: response.started === true,
          alreadyRunning: response.alreadyRunning === true,
          message: typeof response.message === "string" ? response.message : "本地桥接已启动",
        });
      },
    );
  });
}
