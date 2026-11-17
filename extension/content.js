"use strict";
(() => {
  if (globalThis.__copilotLatencyContent) return;
  globalThis.__copilotLatencyContent = true;
  const { validateMain } = globalThis.CopilotSpeedStatus;
  const { settingsFrom, findMatches } = globalThis.CopilotSpeedTargets;
  const origin = location.origin;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,"0")).join("");
  const configuredPatterns = chrome.runtime.getManifest().host_permissions ?? [];
  let settings = settingsFrom({}, configuredPatterns), main = null, stopping = false;
  const enabled = () => findMatches(settings,location.href).some(pattern => settings.enabledPatterns[pattern]);
  function probe() {
    window.postMessage({ channel:"copilot-latency-lab-v1", direction:"extension", type:"probe", nonce }, origin);
  }
  function stopAfterError() {
    if (main?.state !== "error" || !enabled() || stopping) return;
    stopping = true;
    chrome.runtime.sendMessage({ type:"disable-after-error" }).catch(() => {}).finally(() => { stopping = false; });
  }
  window.addEventListener("message", event => {
    const m = event.data;
    if (event.source !== window || event.origin !== origin || m?.channel !== "copilot-latency-lab-v1" ||
        m.direction !== "main" || m.nonce !== nonce) return;
    const validated = validateMain(m);
    if (validated) { main = validated; stopAfterError(); }
  });
  chrome.runtime.onMessage.addListener((message, sender, respond) => {
    if (sender.id !== chrome.runtime.id || message?.type !== "status") return;
    probe();
    respond({ enabled:enabled(), main });
  });
  async function refreshSettings() {
    const storage = await chrome.storage.local.get("enabledPatterns");
    settings = settingsFrom(storage, configuredPatterns);
    probe();
    stopAfterError();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabledPatterns) refreshSettings().catch(() => {});
  });
  refreshSettings().catch(() => {});
  window.addEventListener("pageshow", probe);
})();
