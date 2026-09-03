import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
const requiredFiles = [
  manifest.background.service_worker,
  manifest.side_panel.default_path,
  "sidepanel.css",
  "sidepanel.js",
  "app-config.js",
  "storage.js",
  "translate.js",
  "page-selection.js",
  "selection-tracker.js",
  "native-bridge.js",
  "native-host/JeffreyTypeTransfer.NativeHost.cs",
  "native-host/codex-login.ps1",
  "native-host/install.ps1",
  "native-host/uninstall.ps1",
];
for (const file of requiredFiles) {
  if (!existsSync(file)) throw new Error(`缺少扩展运行文件：${file}`);
}

for (const file of requiredFiles.filter((file) => file.endsWith(".js"))) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || `${file} 语法检查失败`);
}
if (!manifest.permissions?.includes("nativeMessaging")) {
  throw new Error("manifest.json 缺少 nativeMessaging 权限");
}

const html = readFileSync(manifest.side_panel.default_path, "utf8");
if (!html.includes('src="sidepanel.js"') || !html.includes('href="sidepanel.css"')) {
  throw new Error("sidepanel.html 没有直接引用原生 JS/CSS");
}
const trackerRegistered = manifest.content_scripts?.some((entry) =>
  entry.js?.includes("selection-tracker.js") && entry.all_frames === true &&
  entry.run_at === "document_start",
);
if (!trackerRegistered) throw new Error("manifest.json 没有在所有页面 frame 注册选区追踪脚本");
const packageJson = JSON.parse(readFileSync("package.json", "utf8"));
if (packageJson.dependencies || packageJson.devDependencies || packageJson.scripts?.build) {
  throw new Error("项目仍包含构建依赖或 build 脚本");
}
for (const legacy of ["dist", "src", "public", "vite.config.ts", "tsconfig.json"]) {
  if (existsSync(legacy)) throw new Error(`仍存在旧构建文件：${legacy}`);
}
console.log(`检查通过：${requiredFiles.length} 个运行文件，零构建依赖。`);
