"use strict";
(() => {
  if (globalThis.__copilotLatencyContent) return;
  globalThis.__copilotLatencyContent = true;
  const { validateMain } = globalThis.CopilotSpeedStatus;
  const origin = location.origin;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16)), n => n.toString(16).padStart(2,"0")).join("");
  let enabled = false, main = null, stopping = false;
  function probe() {
    window.postMessage({ channel:"copilot-latency-lab-v1", direction:"extension", type:"probe", nonce }, origin);
  }
  function stopAfterError() {
    if (main?.state !== "error" || !enabled || stopping) return;
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
    respond({ enabled, main });
  });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.enabledOrigins) {
      enabled = changes.enabledOrigins.newValue?.[origin] === true;
      stopAfterError();
    }
  });
  chrome.storage.local.get("enabledOrigins").then(settings => {
    enabled = settings.enabledOrigins?.[origin] === true;
    probe();
    stopAfterError();
  }).catch(() => {});
  window.addEventListener("pageshow", probe);
})();
