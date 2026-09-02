import { useEffect, useState } from "react";
import { SettingsPage } from "./components/SettingsPage";
import { Translator } from "./components/Translator";
import { loadConfig, saveConfig } from "./lib/storage";
import { checkBridge } from "./lib/translate";
import { DEFAULT_CONFIG, type AppConfig } from "./types";

export default function App() {
  const [config, setConfig] = useState<AppConfig>(DEFAULT_CONFIG);
  const [view, setView] = useState<"translator" | "settings">("translator");
  const [bridgeConnected, setBridgeConnected] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      const storedConfig = await loadConfig();
      setConfig(storedConfig);
      if (storedConfig.mode === "cli") {
        setBridgeConnected(
          await checkBridge(storedConfig.bridgeUrl, storedConfig.cliProvider)
            .then((health) => health.ready)
            .catch(() => false),
        );
      }
      setReady(true);
    })();
  }, []);

  const handleSaveConfig = async (nextConfig: AppConfig) => {
    await saveConfig(nextConfig);
    setConfig(nextConfig);
    if (nextConfig.mode === "cli") {
      setBridgeConnected(
        await checkBridge(nextConfig.bridgeUrl, nextConfig.cliProvider)
          .then((health) => health.ready)
          .catch(() => false),
      );
    } else {
      setBridgeConnected(false);
    }
  };

  const handleQuickConfigChange = (change: Pick<AppConfig, "targetLanguage" | "tone">) => {
    const nextConfig = { ...config, ...change };
    setConfig(nextConfig);
    void saveConfig(nextConfig);
  };

  if (!ready) {
    return (
      <main className="app-loading" aria-live="polite">
        <span className="brand-mark">jeffrey-type-transfer</span>
        <span>正在准备翻译空间…</span>
      </main>
    );
  }

  return view === "settings" ? (
    <SettingsPage
      config={config}
      bridgeConnected={bridgeConnected}
      onBack={() => setView("translator")}
      onSave={handleSaveConfig}
      onBridgeStatusChange={setBridgeConnected}
    />
  ) : (
    <Translator
      config={config}
      bridgeConnected={bridgeConnected}
      onOpenSettings={() => setView("settings")}
      onConfigChange={handleQuickConfigChange}
    />
  );
}
