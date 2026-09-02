import { replaceInputSelectionInPage } from "../page-selection.js";

document.querySelector("#replace-frame-selection")?.addEventListener("click", () => {
  const selection = window.lastTrackedSelection;
  const result = selection
    ? replaceInputSelectionInPage({ selection, replacement: "iframe replacement" })
    : { ok: false, error: "没有选区" };
  document.querySelector("#frame-replace-result").textContent = result.ok ? "替换成功" : result.error;
});
