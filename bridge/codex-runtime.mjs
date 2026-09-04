import { existsSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join } from "node:path";

function existingAbsolutePath(value) {
  return typeof value === "string" && isAbsolute(value) && existsSync(value) ? value : null;
}

function newestDesktopCodex(localAppData) {
  if (!localAppData) return null;
  const binRoot = join(localAppData, "OpenAI", "Codex", "bin");
  if (!existsSync(binRoot)) return null;

  try {
    return readdirSync(binRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => join(binRoot, entry.name, "codex.exe"))
      .filter((candidate) => existsSync(candidate))
      .map((candidate) => ({ candidate, modified: statSync(candidate).mtimeMs }))
      .sort((left, right) => right.modified - left.modified)[0]?.candidate ?? null;
  } catch {
    return null;
  }
}

export function resolveCodexCommand({ configuredPath, env = process.env } = {}) {
  for (const candidate of [configuredPath, env.CODEX_BIN]) {
    const existing = existingAbsolutePath(candidate);
    if (existing) return existing;
  }

  if (process.platform === "win32") {
    const desktopCodex = newestDesktopCodex(env.LOCALAPPDATA);
    if (desktopCodex) return desktopCodex;

    for (const candidate of [
      env.APPDATA && join(env.APPDATA, "npm", "codex.exe"),
      env.APPDATA && join(env.APPDATA, "npm", "codex.cmd"),
    ]) {
      const existing = existingAbsolutePath(candidate);
      if (existing) return existing;
    }
  }

  return typeof env.CODEX_BIN === "string" && env.CODEX_BIN.trim()
    ? env.CODEX_BIN.trim()
    : "codex";
}

export function resolveCodexHome(configuredHome, env = process.env) {
  if (typeof configuredHome === "string" && isAbsolute(configuredHome)) return configuredHome;
  if (typeof env.CODEX_HOME === "string" && isAbsolute(env.CODEX_HOME)) return env.CODEX_HOME;
  return null;
}
