"use strict";
const $ = id => document.getElementById(id);
const ORIGINS = ["https://copilot.com", "https://copilot.microsoft.com", "https://m365.cloud.microsoft"];
let tabId, origin, ready = false, busy = false, revision = 0, awaitingReload = false;
function showState(title, detail, tone = "") {
  $("state").textContent = title;
  $("detail").textContent = detail;
  $("dot").className = `dot ${tone}`;
}
function render(status) {
  $("optimization").checked = status.enabled;
  const main = status.main;
  if (awaitingReload && ((status.enabled && main?.state === "optimized") || (!status.enabled && !main))) {
    awaitingReload = false;
    $("message").textContent = "";
  }
  if (main?.state === "error") showState("再読み込みが必要です", "高速化を続けられません。ページを再読み込みしてください。", "warning");
  else if (!status.enabled && main) showState("再読み込み待ち", "高速化を停止するには、ページを再読み込みしてください。", "warning");
  else if (!status.enabled) showState("オフ", "高速化は無効です。");
  else if (!main) showState("再読み込み待ち", "高速化を開始するには、ページを再読み込みしてください。", "warning");
  else if (main.state === "optimized") showState("高速化が有効です", "このタブで動作しています。", "active");
  else if (main.state === "waiting") showState("確認中", "ページの読み込みを待っています。");
  else if (main.reason === "already-initialized") showState("再読み込みが必要です", "ページを再読み込みしてください。", "warning");
  else showState("このページでは利用できません", "通常どおり Copilot を利用できます。", "warning");
}
async function refresh() {
  if (!ready || busy) return;
  const requested = revision;
  try {
    const [status, settings] = await Promise.all([
      chrome.tabs.sendMessage(tabId, { type:"status" }), chrome.storage.local.get("enabledOrigins")
    ]);
    if (busy || requested !== revision) return;
    render({ ...status, enabled:settings.enabledOrigins?.[origin] === true });
  } catch {
    if (busy || requested !== revision) return;
    ready = false;
    showState("再読み込みが必要です", "Copilot のタブを再読み込みしてください。", "warning");
    $("optimization").disabled = true;
  }
}
$("optimization").addEventListener("change", async () => {
  revision++;
  busy = true;
  $("optimization").disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type:"set-optimization", origin, enabled:$("optimization").checked });
    if (!response?.ok) throw new Error("設定を保存できませんでした。もう一度お試しください。");
    awaitingReload = true;
    $("message").textContent = "設定を保存しました。ページを再読み込みしてください。";
  } catch (error) { $("message").textContent = error.message; }
  finally { busy = false; $("optimization").disabled = false; await refresh(); }
});
async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    origin = new URL(tab?.url ?? "about:blank").origin;
    if (!ORIGINS.includes(origin)) {
      showState("Copilot を開いてください", "Copilot のタブでこの拡張機能を開いてください。");
      $("site").textContent = "";
      return;
    }
    tabId = tab.id;
    $("site").textContent = new URL(origin).hostname;
    ready = true;
    $("optimization").disabled = false;
    await refresh();
  } catch { showState("接続できません", "Copilot のタブを開き直してください。", "warning"); }
}
$("version").textContent = `Copilot Speed ${chrome.runtime.getManifest().version}`;
initialize();
setInterval(refresh, 1000);
