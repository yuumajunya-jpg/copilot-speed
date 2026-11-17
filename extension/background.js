"use strict";
importScripts("lib/targets.js");
const { settingsFrom, findMatches, parsePattern } = globalThis.CopilotSpeedTargets;
let queue = Promise.resolve();
const readSettings = async () => settingsFrom(
  await chrome.storage.local.get(["enabledPatterns", "enabledOrigins"]),
  chrome.runtime.getManifest().host_permissions ?? []
);
function enqueue(work) {
  const task = queue.then(work);
  queue = task.catch(() => {});
  return task;
}
async function permitted(patterns) {
  const checks = await Promise.all(patterns.map(pattern => chrome.permissions.contains({ origins:[parsePattern(pattern).permission] })));
  return patterns.filter((_,index) => checks[index]);
}
async function syncScripts(settings) {
  const accessible = await permitted(settings.patterns);
  const desired = [
    { id:"cll-status", matches:accessible, js:["lib/targets.js", "lib/status.js", "content.js"], world:"ISOLATED" },
    { id:"cll-main", matches:accessible.filter(pattern => settings.enabledPatterns[pattern]), js:["lib/sha256.js", "lib/registry.js", "main.js"], world:"MAIN" }
  ];
  const registered = await chrome.scripting.getRegisteredContentScripts();
  const desiredIds = new Set(desired.filter(script => script.matches.length).map(script => script.id));
  const obsolete = registered.filter(script => script.id.startsWith("cll-") && !desiredIds.has(script.id));
  if (obsolete.length) await chrome.scripting.unregisterContentScripts({ ids:obsolete.map(script => script.id) });
  for (const script of desired) {
    if (!script.matches.length) continue;
    const value = { ...script, runAt:"document_start", allFrames:false, persistAcrossSessions:true };
    if (registered.some(existing => existing.id === script.id)) await chrome.scripting.updateContentScripts([value]);
    else await chrome.scripting.registerContentScripts([value]);
  }
}
async function saveSettings(next, previous) {
  try {
    await syncScripts(next);
    await chrome.storage.local.set({ enabledPatterns:next.enabledPatterns });
  }
  catch (error) { await syncScripts(previous); throw error; }
}
async function reconcile() {
  const settings = await readSettings();
  await syncScripts(settings);
  await chrome.storage.local.set({ enabledPatterns:settings.enabledPatterns });
  await chrome.storage.local.remove(["diagnosticsOrigins", "enabledOrigins", "targetPatterns"]);
}
chrome.runtime.onInstalled.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.runtime.onStartup.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.permissions.onAdded.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.permissions.onRemoved.addListener(() => { enqueue(reconcile).catch(console.error); });
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return;
  const popup = sender.url === chrome.runtime.getURL("popup.html");
  const stop = message?.type === "disable-after-error" && sender.tab && sender.frameId === 0;
  if (!popup && !stop) return;
  enqueue(async () => {
    const settings = await readSettings();
    if (stop) {
      const matched = findMatches(settings, sender.url);
      if (!matched.length) return { ok:false };
      const enabledPatterns = { ...settings.enabledPatterns };
      for (const pattern of matched) enabledPatterns[pattern] = false;
      await saveSettings({ ...settings, enabledPatterns }, settings);
      return { ok:true };
    }
    if (popup && message?.type === "page-settings") {
      const matched = findMatches(settings, message.url);
      return { ok:true, matched, enabled:matched.some(pattern => settings.enabledPatterns[pattern]),
        hasPermission:matched.length > 0 && (await permitted(matched)).length === matched.length };
    }
    if (popup && message?.type === "set-optimization" && typeof message.enabled === "boolean") {
      const matched = findMatches(settings, message.url);
      if (!matched.length || (await permitted(matched)).length !== matched.length) return { ok:false, error:"対象 URL の設定とアクセス許可を確認してください。" };
      const enabledPatterns = { ...settings.enabledPatterns };
      for (const pattern of matched) enabledPatterns[pattern] = message.enabled;
      await saveSettings({ ...settings, enabledPatterns }, settings);
      return { ok:true };
    }
    return { ok:false, error:"この操作は利用できません。" };
  }).then(respond, error => respond({ ok:false, error:error.message || "設定を保存できませんでした。" }));
  return true;
});
