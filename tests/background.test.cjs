"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
function harness(){
 let listener,installed;const scripts=new Map(),storage={};let failSave=false;
 const chrome={runtime:{id:"test",getURL:file=>`chrome-extension://test/${file}`,
  onInstalled:{addListener(fn){installed=fn;}},onStartup:{addListener(){}},onMessage:{addListener(fn){listener=fn;}}},
  storage:{local:{async get(){return structuredClone(storage);},async set(value){if(failSave)throw Error("save failed");Object.assign(storage,structuredClone(value));},async remove(key){delete storage[key];}}},
  scripting:{async getRegisteredContentScripts({ids}){return ids.filter(id=>scripts.has(id)).map(id=>scripts.get(id));},
   async registerContentScripts(values){for(const s of values)scripts.set(s.id,s);},async unregisterContentScripts({ids}){ids.forEach(id=>scripts.delete(id));}}};
 vm.runInNewContext(source("background.js"),{chrome,console,URL});
 const sender={id:"test",url:"chrome-extension://test/popup.html"};
 const send=(message,from=sender)=>new Promise(resolve=>{const async=listener(message,from,resolve);if(!async)resolve(undefined);});
 return{send,scripts,storage,failSave(){failSave=true;},installed};
}
test("only popup can enable a known origin; dynamic script is MAIN at document_start",async()=>{
 const h=harness();
 assert.equal(await h.send({type:"set-optimization",origin:"https://evil.example",enabled:true}),undefined);
 assert.equal(await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:true},{id:"test",url:"https://copilot.com",tab:{id:1}}),undefined);
 assert.equal(h.scripts.size,0);
 assert.equal((await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:true})).ok,true);
 const script=h.scripts.get("cll-main-0");assert.equal(script.world,"MAIN");assert.equal(script.runAt,"document_start");assert.equal(script.allFrames,false);
 assert.equal(h.storage.enabledOrigins["https://copilot.com"],true);
 await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:false});
 assert.equal(h.scripts.size,0);
});
test("concurrent settings do not overwrite other origins",async()=>{
 const h=harness();
 await Promise.all(["https://copilot.com","https://m365.cloud.microsoft"].map(origin=>h.send({type:"set-optimization",origin,enabled:true})));
 assert.equal(h.scripts.size,2);assert.equal(Object.values(h.storage.enabledOrigins).filter(Boolean).length,2);
});
test("extension-owned popup also works when opened as a full browser tab",async()=>{
 const h=harness();const response=await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:true},
  {id:"test",url:"chrome-extension://test/popup.html",tab:{id:99}});
 assert.equal(response.ok,true);assert.equal(h.scripts.size,1);
});
test("storage failure rolls back dynamic registration",async()=>{
 const h=harness();h.failSave();
 const result=await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:true});
 assert.equal(result.ok,false);assert.equal(h.scripts.size,0);
});
test("automatic stop only disables the sending top-frame content script's own site",async()=>{
 const h=harness();await h.send({type:"set-optimization",origin:"https://copilot.com",enabled:true});
 assert.equal(await h.send({type:"disable-after-error"},{id:"test",tab:{id:1},frameId:3,url:"https://copilot.com/"}),undefined);
 assert.equal(h.scripts.size,1);
 const result=await h.send({type:"disable-after-error",origin:"https://m365.cloud.microsoft"},{id:"test",tab:{id:1},frameId:0,url:"https://copilot.com/chats/private-id"});
 assert.equal(result.ok,true);assert.equal(h.scripts.size,0);assert.equal(h.storage.enabledOrigins["https://copilot.com"],false);
});
test("upgrade removes the old diagnostics setting and preserves optimization preferences",async()=>{
 const h=harness();h.storage.enabledOrigins={"https://copilot.com":true};h.storage.diagnosticsOrigins={"https://copilot.com":true};
 h.installed();await new Promise(setImmediate);
 assert.equal(Object.hasOwn(h.storage,"diagnosticsOrigins"),false);
 assert.equal(h.storage.enabledOrigins["https://copilot.com"],true);assert.equal(h.scripts.size,1);
});
