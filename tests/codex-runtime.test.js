import assert from "node:assert/strict";
import { mkdir, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveCodexCommand, resolveCodexHome } from "../bridge/codex-runtime.mjs";

test("Codex 桌面版更新后自动选择最新的可执行文件", async (context) => {
  const root = join(tmpdir(), `jeffrey-codex-runtime-${process.pid}-${Date.now()}`);
  context.after(() => rm(root, { recursive: true, force: true }));
  const oldPath = join(root, "OpenAI", "Codex", "bin", "old", "codex.exe");
  const newPath = join(root, "OpenAI", "Codex", "bin", "new", "codex.exe");
  await mkdir(join(oldPath, ".."), { recursive: true });
  await mkdir(join(newPath, ".."), { recursive: true });
  await writeFile(oldPath, "old");
  await writeFile(newPath, "new");
  await utimes(oldPath, new Date(1_000), new Date(1_000));
  await utimes(newPath, new Date(2_000), new Date(2_000));

  const resolved = resolveCodexCommand({
    configuredPath: join(root, "missing", "codex.exe"),
    env: { LOCALAPPDATA: root },
  });

  if (process.platform === "win32") assert.equal(resolved, newPath);
  else assert.equal(resolved, "codex");
});

test("桥接优先复用注册时明确记录的 CODEX_HOME", () => {
  const configured = process.platform === "win32" ? "C:\\Users\\me\\.codex" : "/home/me/.codex";
  const inherited = process.platform === "win32" ? "C:\\Users\\other\\.codex" : "/home/other/.codex";
  assert.equal(resolveCodexHome(configured, { CODEX_HOME: inherited }), configured);
});
