import {
  captureInputSelectionInPage,
  replaceInputSelectionInPage,
} from "../page-selection.js";

window.fixtureApi = {
  capture: captureInputSelectionInPage,
  replace: replaceInputSelectionInPage,
};

document.querySelector("#replace-selection")?.addEventListener("click", () => {
  const selection = window.lastTrackedSelection;
  const result = selection
    ? replaceInputSelectionInPage({ selection, replacement: "translated replacement" })
    : { ok: false, error: "没有选区" };
  document.querySelector("#replace-result").textContent = result.ok ? "替换成功" : result.error;
});
