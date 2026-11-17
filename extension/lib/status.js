"use strict";
(() => {
  const states = new Set(["waiting", "optimized", "unsupported", "error"]);
  const reasons = new Set(["awaiting-chunk", "script-url-mismatch", "factory-mismatch", "verified-factories",
    "inspection-failed", "chunk-global-not-hookable", "already-initialized", "target-not-observed",
    "initialization-failed", "push-not-callable", "runtime-failed", "restoration-failed"]);
  function validateMain(message) {
    if (!message || !states.has(message.state) || !reasons.has(message.reason) ||
        message.adapter !== "fluent-context-ed520e7e-v1") return null;
    return { state:message.state, reason:message.reason };
  }
  function validateDiagnostic(message) {
    const status = validateMain(message);
    if (!status || message.diagnostic !== true) return null;
    const value = message.inspection;
    if (value === null) return { ...status, inspection:null };
    const validHost = text => text === null || (typeof text === "string" && /^[a-z0-9.-]{1,253}$/.test(text));
    const validFile = text => text === null || (typeof text === "string" && /^[a-zA-Z0-9._-]{0,120}$/.test(text));
    if (!value || !validHost(value.scriptHost) || !validFile(value.scriptFile)) return null;
    const modules = {};
    for (const id of ["900823", "62229"]) {
      const entry = value.modules?.[id];
      if (!entry || typeof entry.present !== "boolean" || typeof entry.matches !== "boolean" ||
          !(entry.hash === null || (typeof entry.hash === "string" && /^[a-f0-9]{64}$/.test(entry.hash)))) return null;
      modules[id] = { present:entry.present, matches:entry.matches, hash:entry.hash };
    }
    return { ...status, inspection:{ scriptHost:value.scriptHost, scriptFile:value.scriptFile, modules } };
  }
  globalThis.CopilotSpeedStatus = { validateMain, validateDiagnostic };
})();
