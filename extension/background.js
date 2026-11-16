"use strict";
const ORIGINS = ["https://copilot.com", "https://copilot.microsoft.com", "https://m365.cloud.microsoft"];
const scriptId = origin => `cll-main-${ORIGINS.indexOf(origin)}`;
let queue = Promise.resolve();

async function configure(origin, enabled) {
  const id = scriptId(origin);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [id] });
  if (enabled && !existing.length) {
    await chrome.scripting.registerContentScripts([{
      id, matches: [`${origin}/*`],
      js: ["lib/sha256.js", "lib/registry.js", "main.js"],
      runAt: "document_start", world: "MAIN", allFrames: false, persistAcrossSessions: true
    }]);
  } else if (!enabled && existing.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [id] });
  }
}

async function reconcile() {
  await chrome.storage.local.remove("diagnosticsOrigins");
  const { enabledOrigins = {} } = await chrome.storage.local.get("enabledOrigins");
  for (const origin of ORIGINS) await configure(origin, enabledOrigins[origin] === true);
}
function enqueue(work) {
  const task = queue.then(work);
  queue = task.catch(() => {});
  return task;
}
chrome.runtime.onInstalled.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  // A content script may only request the safe direction: disable its own site.
  // No page-supplied origin, URL, or other setting is accepted on this path.
  if (message?.type === "disable-after-error" && sender.id === chrome.runtime.id && sender.tab && sender.frameId === 0) {
    let origin;
    try { origin = new URL(sender.url).origin; } catch { return; }
    if (!ORIGINS.includes(origin)) return;
    enqueue(async () => {
      await configure(origin, false);
      const { enabledOrigins = {} } = await chrome.storage.local.get("enabledOrigins");
      await chrome.storage.local.set({ enabledOrigins:{ ...enabledOrigins, [origin]:false } });
      return { ok:true };
    }).then(respond, () => respond({ ok:false }));
    return true;
  }
  // Settings changes must originate from this extension's popup, never a page.
  if (sender.id !== chrome.runtime.id || sender.url !== chrome.runtime.getURL("popup.html")) return;
  if (message?.type !== "set-optimization" || !ORIGINS.includes(message.origin) || typeof message.enabled !== "boolean") return;
  enqueue(async () => {
    const { enabledOrigins = {} } = await chrome.storage.local.get("enabledOrigins");
    const old = enabledOrigins[message.origin] === true;
    await configure(message.origin, message.enabled);
    try {
      await chrome.storage.local.set({ enabledOrigins: { ...enabledOrigins, [message.origin]: message.enabled } });
    } catch (error) {
      await configure(message.origin, old);
      throw error;
    }
    return { ok: true };
  }).then(respond, () => respond({ ok: false, error: "設定を保存できませんでした。" }));
  return true;
});
