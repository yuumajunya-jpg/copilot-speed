"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { performance } = require("node:perf_hooks");
const extension = path.resolve(__dirname,"../extension");
const source = file => fs.readFileSync(path.join(extension,file),"utf8");
function mainHarness() {
  const listeners = {};
  const messages = [];
  const timers = new Map();
  let timerId = 0;
  const window = { addEventListener(type, callback) { listeners[type] = callback; }, postMessage(message) { messages.push(message); } };
  const ctx = vm.createContext({ window, location:{origin:"https://copilot.com"},
    document:{currentScript:{src:"https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.ed520e7e.js"}},
    performance, TextEncoder, URL,
    setTimeout(fn) { const id=++timerId; timers.set(id,fn); return id; }, clearTimeout(id) { timers.delete(id); }
  });
  function load() {
    for (const file of ["lib/sha256.js","lib/registry.js","main.js"]) vm.runInContext(source(file),ctx,{filename:file});
  }
  function status(type = "probe") {
    listeners.message({source:window,origin:"https://copilot.com",data:{channel:"copilot-latency-lab-v1",direction:"extension",type,nonce:"a".repeat(32)}});
    return messages.at(-1);
  }
  return {ctx,load,status,diagnose:()=>status("diagnose"),timers,run:code=>vm.runInContext(code,ctx)};
}
function registryFactory() {
  const ctx = vm.createContext({ performance });
  vm.runInContext(source("lib/registry.js"),ctx);
  return ctx.__cllCreateRegistry;
}
function vendorChunk() {
  const file=path.resolve(__dirname,"../research/vendors.js");
  if (!fs.existsSync(file)) return null;
  let chunk;
  vm.runInNewContext(fs.readFileSync(file,"utf8"),{self:{rspackChunk_1js_m365_copilot_app:{push(value) { chunk=value; }}}});
  return chunk;
}
module.exports = {source,mainHarness,registryFactory,vendorChunk};
