import { useEffect, useMemo, useState, type MouseEvent } from "react";
import {
  CheckCircle2,
  Columns2,
  Languages,
  LoaderCircle,
  MousePointer2,
  RefreshCw,
  ScanText,
  Settings,
  Sparkles,
} from "lucide-react";
import { capturePageSelection, replacePageSelection } from "../lib/pageSelection";
import {
  JOB_STATE_KEY,
  LAST_COMPARISON_KEY,
  loadJobState,
  loadLastComparison,
  saveLastComparison,
} from "../lib/storage";
import { translateText } from "../lib/translate";
import type {
  AppConfig,
  ComparisonRecord,
  PageSelection,
  TranslationJobState,
} from "../types";
import { getCliProviderMeta } from "../types";
import { IconButton } from "./IconButton";

const LANGUAGES = [
  { value: "Chinese (Simplified)", label: "简体中文" },
  { value: "Chinese (Traditional)", label: "繁體中文" },
  { value: "English", label: "English" },
  { value: "Japanese", label: "日本語" },
  { value: "Korean", label: "한국어" },
  { value: "French", label: "Français" },
  { value: "German", label: "Deutsch" },
  { value: "Spanish", label: "Español" },
  { value: "Russian", label: "Русский" },
  { value: "Arabic", label: "العربية" },
  { value: "Portuguese", label: "Português" },
  { value: "Italian", label: "Italiano" },
];

const DEMO_SOURCE = "把想法带到任何语言里，让沟通更自然。";
const DEMO_SELECTION: PageSelection = {
  token: "preview-selection",
  text: DEMO_SOURCE,
  start: 0,
  end: DEMO_SOURCE.length,
  elementName: "textarea",
};
const DEMO_COMPARISON: ComparisonRecord = {
  source: DEMO_SOURCE,
  translation: "Carry your ideas into any language, and make communication feel natural.",
  detectedLanguage: "简体中文",
  targetLanguage: "English",
  provider: "Codex CLI",
  createdAt: Date.now(),
  segments: [
    { source: "把想法带到任何语言里，", target: "Carry your ideas into any language," },
    { source: "让沟通更自然。", target: "and make communication feel natural." },
  ],
};

interface TranslatorProps {
  config: AppConfig;
  bridgeConnected: boolean;
  onOpenSettings: () => void;
  onConfigChange: (change: Pick<AppConfig, "targetLanguage" | "tone">) => void;
}

function isExtensionRuntime() {
  return typeof chrome !== "undefined" && Boolean(chrome.scripting && chrome.storage?.local);
}

export function Translator({
  config,
  bridgeConnected,
  onOpenSettings,
  onConfigChange,
}: TranslatorProps) {
  const extensionRuntime = isExtensionRuntime();
  const previewEmpty =
    !extensionRuntime && new URLSearchParams(window.location.search).has("empty");
  const [pageSelection, setPageSelection] = useState<PageSelection | null>(
    extensionRuntime || previewEmpty ? null : DEMO_SELECTION,
  );
  const [comparison, setComparison] = useState<ComparisonRecord | null>(
    extensionRuntime ? null : DEMO_COMPARISON,
  );
  const [jobState, setJobState] = useState<TranslationJobState | null>(null);
  const [activeSegments, setActiveSegments] = useState<Set<number>>(new Set());
  const [isPending, setIsPending] = useState(false);

  const connection = useMemo(() => {
    if (config.mode === "api") {
      return {
        connected: Boolean(config.apiKey && config.apiModel),
        label: config.apiKey ? `API · ${config.apiModel}` : "API Key · 待配置",
      };
    }
    return {
      connected: bridgeConnected,
      label: bridgeConnected
        ? `${getCliProviderMeta(config.cliProvider).shortLabel} · 已连接`
        : `${getCliProviderMeta(config.cliProvider).shortLabel} · 未连接`,
    };
  }, [bridgeConnected, config]);

  const refreshSelection = async () => {
    if (!extensionRuntime) {
      setPageSelection(previewEmpty ? null : DEMO_SELECTION);
      return;
    }
    setPageSelection(await capturePageSelection().catch(() => null));
  };

  useEffect(() => {
    if (!extensionRuntime) return;
    let active = true;
    void Promise.all([loadLastComparison(), loadJobState()]).then(([savedComparison, savedJob]) => {
      if (!active) return;
      setComparison(savedComparison);
      setJobState(savedJob);
      setIsPending(savedJob?.status === "running");
    });
    void refreshSelection();
    const timer = window.setInterval(() => void refreshSelection(), 900);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [extensionRuntime]);

  useEffect(() => {
    if (!extensionRuntime) return;
    const listener = (changes: Record<string, { newValue?: unknown }>) => {
      const nextComparison = changes[LAST_COMPARISON_KEY]?.newValue;
      const nextJob = changes[JOB_STATE_KEY]?.newValue;
      if (nextComparison) setComparison(nextComparison as ComparisonRecord);
      if (nextJob) {
        const state = nextJob as TranslationJobState;
        setJobState(state);
        setIsPending(state.status === "running");
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, [extensionRuntime]);

  const handleTranslate = async () => {
    if (!pageSelection) return;
    if (config.mode === "cli" && !bridgeConnected && extensionRuntime) {
      setJobState({
        status: "error",
        message: `${getCliProviderMeta(config.cliProvider).shortLabel} 尚未连接，请先打开设置完成配置并检测连接`,
        createdAt: Date.now(),
      });
      return;
    }
    if (config.mode === "api" && (!config.apiKey.trim() || !config.apiModel.trim())) {
      setJobState({
        status: "error",
        message: "API Key 模式尚未配置完成，请先打开连接设置",
        createdAt: Date.now(),
      });
      return;
    }

    setIsPending(true);
    setJobState({ status: "running", message: "正在翻译并准备替换选区…", createdAt: Date.now() });
    try {
      const result = extensionRuntime
        ? await translateText(config, {
            text: pageSelection.text,
            sourceLanguage: "auto",
            targetLanguage: config.targetLanguage,
            tone: config.tone,
          })
        : DEMO_COMPARISON;
      await replacePageSelection(pageSelection, result.translation);
      const nextComparison: ComparisonRecord = {
        ...result,
        source: pageSelection.text,
        targetLanguage: config.targetLanguage,
        createdAt: Date.now(),
      };
      if (extensionRuntime) await saveLastComparison(nextComparison);
      setComparison(nextComparison);
      setPageSelection(extensionRuntime ? null : DEMO_SELECTION);
      setActiveSegments(new Set());
      setJobState({
        status: "success",
        message: `已通过 ${result.provider} 翻译并替换页面选区`,
        createdAt: Date.now(),
      });
    } catch (error) {
      setJobState({
        status: "error",
        message: error instanceof Error ? error.message : "翻译失败，请检查连接设置",
        createdAt: Date.now(),
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleSourceSelection = (event: MouseEvent<HTMLDivElement>) => {
    const selected = window.getSelection();
    if (!selected || selected.isCollapsed || selected.rangeCount === 0) {
      setActiveSegments(new Set());
      return;
    }
    const range = selected.getRangeAt(0);
    const indexes = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>("[data-source-index]"),
    )
      .filter((node) => range.intersectsNode(node))
      .map((node) => Number(node.dataset.sourceIndex));
    setActiveSegments(new Set(indexes));
  };

  const controlsDisabled = !pageSelection || isPending;

  return (
    <main className="app-shell translator-shell">
      <header className="app-header">
        <div>
          <h1 className="brand-mark">jeffrey-type-transfer</h1>
          <button className="connection-status" onClick={onOpenSettings}>
            <span className={`status-dot ${connection.connected ? "is-online" : "is-offline"}`} />
            {connection.label}
          </button>
        </div>
        <IconButton label="打开连接与设置" onClick={onOpenSettings}>
          <Settings size={24} strokeWidth={1.8} />
        </IconButton>
      </header>

      <section className="workflow-section" aria-labelledby="selection-heading">
        <div className="section-heading">
          <span className="section-heading-icon"><ScanText size={19} /></span>
          <div>
            <span>页面输入框</span>
            <h2 id="selection-heading">当前选区</h2>
          </div>
          <button className="refresh-selection" onClick={() => void refreshSelection()} aria-label="重新读取页面选区">
            <RefreshCw size={16} /> 重新读取
          </button>
        </div>

        {pageSelection ? (
          <div className="selection-card is-active">
            <div className="selection-meta">
              <span><CheckCircle2 size={15} /> 已锁定选区</span>
              <span>{pageSelection.text.length.toLocaleString()} 个字符</span>
            </div>
            <blockquote>{pageSelection.text}</blockquote>
          </div>
        ) : (
          <div className="selection-card is-empty">
            <MousePointer2 size={24} />
            <div>
              <strong>尚未选中可翻译的文字</strong>
              <p>请先在网页的输入框或文本框中拖选文字。</p>
            </div>
          </div>
        )}

        <div className="selection-controls">
          <label>
            <span>目标语言</span>
            <select
              value={config.targetLanguage}
              disabled={controlsDisabled}
              onChange={(event) => onConfigChange({ targetLanguage: event.target.value, tone: config.tone })}
            >
              {LANGUAGES.map((language) => (
                <option key={language.value} value={language.value}>{language.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span>语气</span>
            <select
              value={config.tone}
              disabled={controlsDisabled}
              onChange={(event) => onConfigChange({ targetLanguage: config.targetLanguage, tone: event.target.value })}
            >
              <option>自然</option>
              <option>正式</option>
              <option>简洁</option>
              <option>口语</option>
            </select>
          </label>
        </div>

        <button className="primary-button translate-replace-button" disabled={controlsDisabled} onClick={() => void handleTranslate()}>
          {isPending ? <LoaderCircle className="spin" size={20} /> : <Sparkles size={19} fill="currentColor" />}
          {isPending ? "正在翻译并替换…" : "翻译并替换选中内容"}
        </button>
        <div className="shortcut-row">
          <span>也可以直接按</span><kbd>Alt</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>T</kbd>
        </div>
        <div className={`inline-message ${jobState?.status === "error" ? "is-error" : ""}`} aria-live="polite">
          {jobState?.message || "选区发生变化时，目标语言与翻译按钮会自动切换状态。"}
        </div>
      </section>

      <section className="comparison-section" aria-labelledby="comparison-heading">
        <div className="section-heading comparison-heading">
          <span className="section-heading-icon mint"><Columns2 size={19} /></span>
          <div>
            <span>语义对齐</span>
            <h2 id="comparison-heading">中英文对照</h2>
          </div>
        </div>
        <p className="comparison-help">在左侧原文中选中一部分，右侧对应译文会同步高亮。</p>

        {comparison ? (
          <div className="comparison-board">
            <div className="comparison-labels">
              <span>{comparison.detectedLanguage || "原文"}</span>
              <span>{comparison.targetLanguage}</span>
            </div>
            <div className="alignment-list" onMouseUp={handleSourceSelection}>
              {comparison.segments.map((segment, index) => (
                <div className="alignment-row" key={`${index}-${segment.source.slice(0, 12)}`}>
                  <div
                    role="button"
                    tabIndex={0}
                    className={`segment-cell segment-source ${activeSegments.has(index) ? "is-highlighted" : ""}`}
                    data-source-index={index}
                    onClick={() => setActiveSegments(new Set([index]))}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setActiveSegments(new Set([index]));
                      }
                    }}
                  >
                    {segment.source}
                  </div>
                  <div className={`segment-cell segment-target ${activeSegments.has(index) ? "is-highlighted" : ""}`}>
                    {segment.target}
                  </div>
                </div>
              ))}
            </div>
            <div className="comparison-foot">
              <Languages size={15} /> {comparison.provider} · 已完成语义分段
            </div>
          </div>
        ) : (
          <div className="comparison-empty">
            <Languages size={25} />
            <strong>还没有对照结果</strong>
            <span>完成一次翻译后，这里会保留最近一次原文与译文。</span>
          </div>
        )}
      </section>
    </main>
  );
}
