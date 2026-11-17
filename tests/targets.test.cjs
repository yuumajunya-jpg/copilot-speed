"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
const ctx=vm.createContext({URL});vm.runInContext(source("lib/targets.js"),ctx);
const t=ctx.CopilotSpeedTargets;
const defaults=JSON.parse(source("manifest.json")).host_permissions;
test("patterns normalize domains and missing paths without expanding explicit paths",()=>{
 assert.equal(t.parsePattern(" https://COPILOT.cloud.chat ").pattern,"https://copilot.cloud.chat/*");
 assert.equal(t.parsePattern("https://example.com/chat").pattern,"https://example.com/chat");
 assert.equal(t.parsePattern("https://*.example.com/chat/*").permission,"https://*.example.com/*");
 assert.equal(t.normalizePatterns(["https://example.com","https://example.com/*"]).length,1);
});
test("matching respects scheme, host boundaries, wildcard base hosts, path and query",()=>{
 const p="https://*.example.com/chat/*";
 for(const url of ["https://example.com/chat/1","https://a.example.com/chat/1?q=2"])assert.equal(t.matches(p,url),true,url);
 for(const url of ["http://example.com/chat/1","https://notexample.com/chat/1","https://example.com.evil/chat/1","https://a.example.com/other/"])assert.equal(t.matches(p,url),false,url);
 assert.equal(t.matches("https://example.com/a.b*","https://example.com/axb"),false);
 assert.equal(t.matches("https://example.com/a.b*","https://example.com/a.b?x=1"),true);
});
test("invalid or unrestricted manifest patterns are rejected",()=>{
 for(const input of ["<all_urls>","https://*/*","*://example.com/*","http://example.com/*","https://user@example.com/*","https://example.com:443/*","https://foo.*.com/*","https://example.com/chat?q=1","https://example.com/#id","https://example.com/a b","https://example..com/*"]){assert.throws(()=>t.parsePattern(input),undefined,input);}
 assert.throws(()=>t.normalizePatterns(Array(51).fill("https://example.com/*")));
});
test("legacy preferences migrate to default patterns and explicit empty targets remain empty",()=>{
 const migrated=t.settingsFrom({enabledOrigins:{"https://copilot.com":true}},defaults);
 assert.equal(migrated.enabledPatterns["https://copilot.com/*"],true);
 assert.equal(migrated.patterns.length,3);
 assert.equal(t.settingsFrom({},[]).patterns.length,0);
 const custom=t.settingsFrom({enabledPatterns:{"https://copilot.cloud.chat/*":true}},["https://copilot.cloud.chat/*"]);
 assert.equal(t.findMatches(custom,"https://copilot.cloud.chat/thread").length,1);
});
