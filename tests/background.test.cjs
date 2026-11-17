"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
function harness(){
 let listener,installed,removed,added;const scripts=new Map(),storage={};let failSave=false,failUpdate=false;
 const manifest=JSON.parse(source("manifest.json"));
 const permissions=new Set(["https://copilot.com/*","https://copilot.microsoft.com/*","https://m365.cloud.microsoft/*"]);
 const chrome={runtime:{id:"test",getURL:file=>`chrome-extension://test/${file}`,getManifest:()=>structuredClone(manifest),
  onInstalled:{addListener(fn){installed=fn;}},onStartup:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},
  storage:{local:{async get(){return structuredClone(storage);},async set(value){if(failSave)throw Error("save failed");Object.assign(storage,structuredClone(value));},async remove(keys){for(const key of [].concat(keys))delete storage[key];}}},
  permissions:{async contains({origins}){return origins.every(origin=>permissions.has(origin));},onAdded:{addListener(fn){added=fn;}},onRemoved:{addListener(fn){removed=fn;}}},
  scripting:{async getRegisteredContentScripts({ids}={}){return [...scripts.values()].filter(s=>!ids||ids.includes(s.id));},
   async registerContentScripts(values){for(const s of values){if(scripts.has(s.id))throw Error("duplicate");scripts.set(s.id,s);}},
   async updateContentScripts(values){if(failUpdate){failUpdate=false;throw Error("update failed");}for(const s of values)scripts.set(s.id,s);},
   async unregisterContentScripts({ids}){ids.forEach(id=>scripts.delete(id));}}};
 const ctx=vm.createContext({chrome,console,URL,importScripts(file){vm.runInContext(source(file),ctx);}});
 vm.runInContext(source("background.js"),ctx);
 const sender={id:"test",url:"chrome-extension://test/popup.html"};
 const send=(message,from=sender)=>new Promise(resolve=>{const async=listener(message,from,resolve);if(!async)resolve(undefined);});
 return{send,manifest,scripts,storage,permissions,failSave(){failSave=true;},failUpdate(){failUpdate=true;},installed:()=>installed(),removed:()=>removed(),added:()=>added()};
}
const tick=()=>new Promise(setImmediate);
const enable=(h,url="https://copilot.com/",enabled=true)=>h.send({type:"set-optimization",url,enabled});
test("only extension popup can enable a configured page; status and MAIN scripts share patterns",async()=>{
 const h=harness();
 assert.equal((await enable(h,"https://evil.example/")).ok,false);
 assert.equal(await h.send({type:"set-optimization",url:"https://copilot.com/",enabled:true},{id:"test",url:"https://copilot.com",tab:{id:1}}),undefined);
 assert.equal((await enable(h)).ok,true);
 const script=h.scripts.get("cll-main");assert.equal(script.world,"MAIN");assert.equal(script.runAt,"document_start");assert.equal(script.allFrames,false);
 assert.equal(h.storage.enabledPatterns["https://copilot.com/*"],true);
 await enable(h,"https://copilot.com/",false);assert.equal(h.scripts.has("cll-main"),false);assert.equal(h.scripts.has("cll-status"),true);
});
test("concurrent settings merge without duplicate MAIN registrations",async()=>{
 const h=harness();await Promise.all([enable(h),enable(h,"https://m365.cloud.microsoft/chat")]);
 assert.equal(h.scripts.size,2);assert.equal(h.scripts.get("cll-main").matches.length,2);
});
test("extension-owned popup works when opened as a full tab",async()=>{
 const h=harness();assert.equal((await h.send({type:"set-optimization",url:"https://copilot.com/",enabled:true},
  {id:"test",url:"chrome-extension://test/popup.html",tab:{id:99}})).ok,true);
});
test("editing manifest targets changes page detection and both registrations",async()=>{
 const h=harness();h.manifest.host_permissions=["https://copilot.cloud.chat/chat/*"];
 h.permissions.add("https://copilot.cloud.chat/*");h.installed();await tick();
 assert.equal((await enable(h,"https://copilot.cloud.chat/other")).ok,false);
 assert.equal((await enable(h,"https://copilot.cloud.chat/chat/thread")).ok,true);
 assert.equal(h.scripts.get("cll-main").matches[0],h.manifest.host_permissions[0]);
 assert.equal(h.scripts.get("cll-status").matches[0],h.manifest.host_permissions[0]);
});
test("removing patterns from the manifest removes registrations and enable flags",async()=>{
 const h=harness();await enable(h);h.manifest.host_permissions=[];h.installed();await tick();
 assert.equal(h.scripts.size,0);assert.equal(Object.keys(h.storage.enabledPatterns).length,0);
});
test("overlapping manifest patterns inject once and toggling off disables all matches",async()=>{
 const h=harness();h.manifest.host_permissions=["https://copilot.com/*","https://copilot.com/chat/*"];
 await enable(h,"https://copilot.com/chat/1");assert.equal(h.scripts.get("cll-main").matches.length,2);
 await enable(h,"https://copilot.com/chat/1",false);assert.equal(h.scripts.has("cll-main"),false);
});
test("storage and registration failures restore prior scripts",async()=>{
 const h=harness();h.failSave();assert.equal((await enable(h)).ok,false);assert.equal(h.scripts.has("cll-main"),false);
 const g=harness();await enable(g);g.failUpdate();assert.equal((await enable(g,"https://m365.cloud.microsoft/chat")).ok,false);
 assert.equal(g.scripts.get("cll-main").matches.length,1);assert.equal(g.storage.enabledPatterns["https://m365.cloud.microsoft/*"],false);
});
test("automatic stop only affects patterns matching its own top-frame URL",async()=>{
 const h=harness();await enable(h);await enable(h,"https://m365.cloud.microsoft/chat");
 assert.equal(await h.send({type:"disable-after-error"},{id:"test",tab:{id:1},frameId:3,url:"https://copilot.com/"}),undefined);
 const result=await h.send({type:"disable-after-error",url:"https://m365.cloud.microsoft"},{id:"test",tab:{id:1},frameId:0,url:"https://copilot.com/private"});
 assert.equal(result.ok,true);assert.equal(h.storage.enabledPatterns["https://copilot.com/*"],false);assert.equal(h.storage.enabledPatterns["https://m365.cloud.microsoft/*"],true);
});
test("upgrade migrates old preferences and removes old registration IDs",async()=>{
 const h=harness();h.storage.enabledOrigins={"https://copilot.com":true};h.storage.diagnosticsOrigins={"https://copilot.com":true};
 h.scripts.set("cll-main-0",{id:"cll-main-0"});h.installed();await tick();
 assert.equal(h.storage.enabledOrigins,undefined);assert.equal(h.storage.diagnosticsOrigins,undefined);
 assert.equal(h.storage.enabledPatterns["https://copilot.com/*"],true);assert.equal(h.scripts.has("cll-main-0"),false);assert.equal(h.scripts.size,2);
});
test("withheld host access stops injection and granting access restores settings",async()=>{
 const h=harness();h.manifest.host_permissions=["https://copilot.cloud.chat/*"];
 h.permissions.add("https://copilot.cloud.chat/*");await enable(h,"https://copilot.cloud.chat/");
 h.permissions.delete("https://copilot.cloud.chat/*");h.removed();await tick();assert.equal(h.scripts.size,0);
 h.permissions.add("https://copilot.cloud.chat/*");h.added();await tick();assert.equal(h.scripts.size,2);
});
test("patterns cannot be changed through messages or stored UI settings",async()=>{
 const h=harness();h.storage.targetPatterns=["https://evil.example/*"];
 assert.equal((await h.send({type:"set-targets",patterns:[]})).ok,false);
 assert.equal(await h.send({type:"set-targets",patterns:[]},{id:"test",url:"chrome-extension://test/options.html"}),undefined);
 const state=await h.send({type:"page-settings",url:"https://copilot.com/chat"});assert.equal(state.matched.length,1);assert.equal(state.hasPermission,true);assert.equal(state.enabled,false);
 assert.equal((await h.send({type:"page-settings",url:"https://evil.example/"})).matched.length,0);
});
