"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
const ctx=vm.createContext({URL});
vm.runInContext(source("lib/status.js"),ctx);vm.runInContext(source("lib/diagnostics.js"),ctx);
const d=ctx.CopilotSpeedDiagnostics;
const base=()=>({version:"0.4.0",url:"https://copilot.com/chat/private?token=secret#fragment",
 settings:{matched:["https://copilot.com/*"],enabled:true,hasPermission:true},
 page:{main:{state:"unsupported",reason:"target-not-observed",inspection:null}},environment:null});
test("specific diagnostic codes distinguish URL, factory, missing target and missing injection",()=>{
 for(const [reason,code]of [["script-url-mismatch","D01"],["factory-mismatch","D02"],["target-not-observed","D03"],["already-initialized","D04"]]){
  const args=base();args.page.main.reason=reason;assert.equal(d.buildReport(args).code,code);
 }
 const args=base();args.page=null;assert.equal(d.buildReport(args).code,"D05");
 args.settings.enabled=false;assert.equal(d.buildReport(args).code,"D09");
});
test("report excludes page path, query, fragment, arbitrary fields and unvalidated inspection",()=>{
 const args=base();args.prompt="PRIVATE_PROMPT";args.page.prompt="PRIVATE_PROMPT";args.page.main.inspection={source:"PRIVATE_SOURCE"};
 const result=d.buildReport(args);assert.equal(result.origin,"https://copilot.com");
 assert.equal(result.optimizer.inspection,null);assert.doesNotMatch(JSON.stringify(result),/secret|fragment|PRIVATE_|chat\/private/);
});
test("runtime failures remain visible after automatic disable",()=>{
 const args=base();args.settings.enabled=false;args.page.main={state:"error",reason:"runtime-failed"};
 assert.equal(d.buildReport(args).code,"D08");
});
test("environment collector reads metadata only and strips script/frame paths and queries",()=>{
 const context=vm.createContext({URL,location:{href:"https://copilot.com/private?secret=PAGE"},
  document:{readyState:"complete",scripts:[{src:"https://cdn.example.com/private/main.vendors.js?token=TOKEN#id"},{src:"data:text/javascript,PRIVATE_CODE"}],
   querySelectorAll(selector){assert.equal(selector,"iframe");return[{getAttribute:()=>"https://frame.example.com/tenant?token=TOKEN"}];}}});
 vm.runInContext("globalThis.rspackChunkExample=[];Object.defineProperty(globalThis,'webpackChunkGuarded',{get(){throw Error('must not invoke')}})",context);
 const result=vm.runInContext(`(${d.collectEnvironment.toString()})()`,context);
 const clean=d.sanitizeEnvironment(result);assert.equal(clean.scripts[0].file,"main.vendors.js");
 assert.equal(clean.frameOrigins[0],"https://frame.example.com");assert.equal(clean.loaders.length,2);
 assert.doesNotMatch(JSON.stringify(clean),/TOKEN|private|tenant|PRIVATE_CODE/);
});
