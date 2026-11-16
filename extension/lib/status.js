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
  globalThis.CopilotSpeedStatus = { validateMain };
})();
