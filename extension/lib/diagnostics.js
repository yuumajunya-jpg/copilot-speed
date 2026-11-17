"use strict";
(() => {
  // Serialized by scripting.executeScript. Keep all dependencies inside this function.
  function collectEnvironment() {
    const cleanURL = input => {
      try {
        const url = new URL(input, location.href);
        if (url.protocol !== "https:") return null;
        return { host:url.hostname.slice(0,253), file:url.pathname.split("/").pop().replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120) };
      } catch { return null; }
    };
    const loaders = [];
    for (const name of Object.getOwnPropertyNames(globalThis)) {
      if (!/^(?:webpackChunk|rspackChunk)[a-zA-Z0-9_$]*$/.test(name) || name.length > 120) continue;
      const descriptor = Object.getOwnPropertyDescriptor(globalThis,name);
      if (!descriptor || (!descriptor.get && descriptor.value === undefined)) continue;
      loaders.push({ name, type:Array.isArray(descriptor.value) ? "array" : descriptor.get ? "accessor" : "other" });
      if (loaders.length === 20) break;
    }
    const scripts = [], seen = new Set();
    const elements = document.scripts;
    for (let i=0;i<Math.min(elements.length,200);i++) {
      if (!elements[i].src) continue;
      const entry = cleanURL(elements[i].src);
      if (!entry || seen.has(`${entry.host}/${entry.file}`)) continue;
      seen.add(`${entry.host}/${entry.file}`);
      scripts.push(entry);
    }
    scripts.sort((a,b) => Number(/main|vendor|chunk|runtime|app|bundle/i.test(b.file)) - Number(/main|vendor|chunk|runtime|app|bundle/i.test(a.file)));
    const frames = document.querySelectorAll("iframe"), frameOrigins = new Set();
    for (let i=0;i<Math.min(frames.length,50);i++) {
      const src = frames[i].getAttribute("src");
      const entry = src ? cleanURL(src) : null;
      if (entry && frameOrigins.size < 10) frameOrigins.add(`https://${entry.host}`);
    }
    return { readyState:document.readyState, loaders, scripts:scripts.slice(0,20),
      scriptCount:Math.min(elements.length,1000000), frameCount:Math.min(frames.length,1000000), frameOrigins:[...frameOrigins] };
  }
  function sanitizeEnvironment(value) {
    if (!value || !["loading","interactive","complete"].includes(value.readyState)) return null;
    const host = text => typeof text === "string" && /^[a-z0-9.-]{1,253}$/.test(text);
    const count = number => Number.isSafeInteger(number) && number >= 0 && number <= 1000000;
    if (!count(value.scriptCount) || !count(value.frameCount) || !Array.isArray(value.loaders) ||
        !Array.isArray(value.scripts) || !Array.isArray(value.frameOrigins)) return null;
    return {
      readyState:value.readyState, scriptCount:value.scriptCount, frameCount:value.frameCount,
      loaders:value.loaders.slice(0,20).filter(item => typeof item?.name === "string" &&
        /^(?:webpackChunk|rspackChunk)[a-zA-Z0-9_$]*$/.test(item.name) && item.name.length <= 120 &&
        ["array","accessor","other"].includes(item.type)).map(item => ({name:item.name,type:item.type})),
      scripts:value.scripts.slice(0,20).filter(item => host(item?.host) && typeof item.file === "string" &&
        /^[a-zA-Z0-9._-]{0,120}$/.test(item.file)).map(item => ({host:item.host,file:item.file})),
      frameOrigins:value.frameOrigins.slice(0,10).filter(origin => typeof origin === "string" &&
        origin.startsWith("https://") && host(origin.slice(8)))
    };
  }
  const reasons = {
    "script-url-mismatch":["D01","スクリプトの URL が対応条件と一致しません。"],
    "factory-mismatch":["D02","内部処理が対応条件と一致しません。"],
    "target-not-observed":["D03","対象の読み込み処理が見つかりません。別の実装や埋め込みページで動いている可能性があります。"],
    "already-initialized":["D04","拡張機能が読み込まれた時点で初期化が終わっていました。ページを再読み込みしてください。"],
    "chunk-global-not-hookable":["D11","対象の読み込み処理に介入できません。"],
    "push-not-callable":["D11","対象の読み込み処理が対応する形式ではありません。"]
  };
  function buildReport({version,url,settings,page,environment}) {
    const { validateMain, validateDiagnostic } = globalThis.CopilotSpeedStatus;
    const adapter = "fluent-context-ed520e7e-v1";
    const main = page?.main ? validateMain({state:page.main.state,reason:page.main.reason,adapter}) : null;
    const detail = main ? validateDiagnostic({...main,adapter,diagnostic:true,inspection:page.main.inspection ?? null}) : null;
    let code, summary;
    if (!settings.matched.length) [code,summary]=["D07","対象 URL に一致していません。設定ファイルを確認してください。"];
    else if (!settings.hasPermission) [code,summary]=["D06","このサイトへのアクセスが許可されていません。"];
    else if (main?.state === "error") [code,summary]=["D08","最適化処理で問題が発生しました。ページを再読み込みしてください。"];
    else if (!settings.enabled) [code,summary]=["D09","高速化の設定がオフです。有効にしてページを再読み込みしてください。"];
    else if (!page || !main) [code,summary]=["D05","ページ内の拡張機能を確認できません。ページを再読み込みしてください。"];
    else if (main.state === "optimized") [code,summary]=["OK","最適化を適用しています。"];
    else if (main.state === "waiting") [code,summary]=["D10","対象コードの読み込みを待っています。ページを開いてから 30 秒ほど待って再診断してください。"];
    else [code,summary]=reasons[main.reason] ?? ["D11","このページの読み込み処理には対応していません。"];
    const sanitized = sanitizeEnvironment(environment);
    return { schemaVersion:1, extensionVersion:version, code, summary, origin:new URL(url).origin,
      target:{matched:settings.matched.length > 0,hasPermission:settings.hasPermission,enabled:settings.enabled},
      pageScriptResponded:Boolean(page), optimizer:main ? {...main,inspection:detail?.inspection ?? null} : null,
      environment:sanitized, environmentUnavailable:sanitized === null };
  }
  globalThis.CopilotSpeedDiagnostics = { collectEnvironment, sanitizeEnvironment, buildReport };
})();
