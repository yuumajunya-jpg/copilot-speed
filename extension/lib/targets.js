"use strict";
(() => {
  function parsePattern(input) {
    if (typeof input !== "string") throw new Error("URL パターンを入力してください。");
    const value = input.trim();
    if (value.length > 2048 || /[\s?#]/.test(value)) throw new Error("URL パターンに空白、クエリ、# は指定できません。");
    const match = /^https:\/\/([^/]+)(\/.*)?$/i.exec(value);
    if (!match) throw new Error("https:// から始まる URL パターンを指定してください。");
    const wildcard = match[1].startsWith("*.");
    const rawHost = wildcard ? match[1].slice(2) : match[1];
    if (!rawHost || /[*:@\\]/.test(rawHost)) throw new Error("ホスト名を指定してください。* は先頭の *. だけ使用できます。");
    let hostname;
    try { hostname = new URL(`https://${rawHost}/`).hostname; } catch { throw new Error("ホスト名が正しくありません。"); }
    if (!/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname) || hostname.includes("..")) throw new Error("ホスト名が正しくありません。");
    const host = `${wildcard ? "*." : ""}${hostname}`;
    const path = match[2] ?? "/*";
    if (/[\\\u0000-\u001f]/.test(path)) throw new Error("URL のパスが正しくありません。");
    return { pattern:`https://${host}${path}`, host:hostname, wildcard, path, permission:`https://${host}/*` };
  }
  function normalizePatterns(values) {
    if (!Array.isArray(values) || values.length > 50) throw new Error("対象 URL は 50 件まで登録できます。");
    return [...new Set(values.map(value => parsePattern(value).pattern))];
  }
  function matches(pattern, input) {
    let target, url;
    try { target = parsePattern(pattern); url = new URL(input); } catch { return false; }
    if (url.protocol !== "https:") return false;
    if (url.hostname !== target.host && !(target.wildcard && url.hostname.endsWith(`.${target.host}`))) return false;
    const escaped = target.path.replace(/[.+?^${}()|[\]\\]/g,"\\$&").replace(/\*/g,".*");
    return new RegExp(`^${escaped}$`).test(url.pathname + url.search);
  }
  function settingsFrom(storage, configuredPatterns) {
    const patterns = normalizePatterns(configuredPatterns);
    const enabledPatterns = {};
    for (const pattern of patterns) {
      const legacyOrigin = pattern.endsWith("/*") ? pattern.slice(0,-2) : null;
      enabledPatterns[pattern] = storage.enabledPatterns
        ? storage.enabledPatterns[pattern] === true
        : Boolean(legacyOrigin && storage.enabledOrigins?.[legacyOrigin] === true);
    }
    return { patterns, enabledPatterns };
  }
  const findMatches = (settings, url) => settings.patterns.filter(pattern => matches(pattern,url));
  globalThis.CopilotSpeedTargets = { parsePattern, normalizePatterns, matches, settingsFrom, findMatches };
})();
