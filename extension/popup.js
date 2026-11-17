"use strict";
const $ = id => document.getElementById(id);
let tabId, url, ready = false, busy = false, revision = 0, awaitingReload = false;
let diagnosticReport = null;
function showState(title, detail, tone = "") {
  $("state").textContent = title;
  $("detail").textContent = detail;
  $("dot").className = `dot ${tone}`;
}
function render(settings, status) {
  $("optimization").checked = settings.enabled;
  $("optimization").disabled = !settings.matched.length || !settings.hasPermission;
  const main = status?.main;
  if (awaitingReload && ((settings.enabled && main?.state === "optimized") || (!settings.enabled && !main))) {
    awaitingReload = false;
    $("message").textContent = "";
  }
  if (!settings.matched.length) showState("対象外のページです", "設定された対象ページで、この拡張機能を開いてください。");
  else if (!settings.hasPermission) showState("アクセスの許可が必要です", "ブラウザの拡張機能管理画面で、このサイトへのアクセスを許可してください。", "warning");
  else if (main?.state === "error") showState("再読み込みが必要です", "高速化を続けられません。ページを再読み込みしてください。", "warning");
  else if (!status) showState("再読み込みが必要です", "設定は変更できます。ページを再読み込みして反映してください。", "warning");
  else if (!settings.enabled && main) showState("再読み込み待ち", "高速化を停止するには、ページを再読み込みしてください。", "warning");
  else if (!settings.enabled) showState("オフ", "高速化は無効です。");
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
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) { url = tab.url; $("site").textContent = new URL(url).hostname; }
    const [settings, status] = await Promise.all([
      chrome.runtime.sendMessage({ type:"page-settings", url }),
      chrome.tabs.sendMessage(tabId, { type:"status" }).catch(() => null)
    ]);
    if (busy || requested !== revision) return;
    if (!settings?.ok) throw new Error("設定を読み込めませんでした。");
    render(settings,status);
  } catch {
    if (busy || requested !== revision) return;
    showState("接続できません", "拡張機能を開き直してください。", "warning");
    $("optimization").disabled = true;
  }
}
$("optimization").addEventListener("change", async () => {
  revision++;
  busy = true;
  $("optimization").disabled = true;
  try {
    const response = await chrome.runtime.sendMessage({ type:"set-optimization", url, enabled:$("optimization").checked });
    if (!response?.ok) throw new Error(response?.error ?? "設定を保存できませんでした。");
    awaitingReload = true;
    $("message").textContent = "設定を保存しました。ページを再読み込みしてください。";
  } catch (error) { $("message").textContent = error.message; }
  finally { busy = false; await refresh(); }
});
$("diagnose").addEventListener("click", async () => {
  $("diagnose").disabled = true;
  $("diagnose").textContent = "診断中…";
  try {
    const response = await chrome.runtime.sendMessage({type:"diagnose",tabId});
    if (!response?.ok) throw new Error("診断できませんでした。拡張機能を開き直してください。");
    diagnosticReport = response.report;
    $("diagnosis-code").textContent = `診断結果 ${diagnosticReport.code}`;
    $("diagnosis-summary").textContent = diagnosticReport.summary;
    $("diagnosis-details").textContent = JSON.stringify(diagnosticReport,null,2);
    $("diagnosis").hidden = false;
  } catch (error) { $("message").textContent = error.message; }
  finally { $("diagnose").disabled = false; $("diagnose").textContent = "再診断"; }
});
$("save-diagnosis").addEventListener("click", () => {
  if (!diagnosticReport) return;
  const blob = new Blob([JSON.stringify(diagnosticReport,null,2)],{type:"application/json"});
  const resource = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = resource;
  link.download = "copilot-speed-diagnosis.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(resource),1000);
});
async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    url = tab?.url;
    if (!url || new URL(url).protocol !== "https:") {
      showState("対象ページを開いてください", "高速化を使うページで、この拡張機能を開いてください。");
      $("site").textContent = "";
      return;
    }
    tabId = tab.id;
    $("site").textContent = new URL(url).hostname;
    ready = true;
    $("diagnose").disabled = false;
    await refresh();
  } catch { showState("接続できません", "対象ページを開き直してください。", "warning"); }
}
$("version").textContent = `Copilot Speed ${chrome.runtime.getManifest().version}`;
initialize();
setInterval(refresh, 1000);
