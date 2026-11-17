"use strict";
const test=require("node:test");
const assert=require("node:assert/strict");
const crypto=require("node:crypto");
const vm=require("node:vm");
const {source,mainHarness,vendorChunk}=require("./helpers.cjs");
const KEY="rspackChunk_1js_m365_copilot_app";
const vendor=vendorChunk();
test("synchronous SHA-256 agrees with Node including UTF-8 and padding boundaries",()=>{
  const ctx=vm.createContext({TextEncoder}); vm.runInContext(source("lib/sha256.js"),ctx);
  for(const s of ["","abc","数式を含む会話",...Array.from({length:150},(_,i)=>"x".repeat(i))]) {
    assert.equal(ctx.__cllSha256(s),crypto.createHash("sha256").update(s).digest("hex"));
  }
});
test("unknown factory is not replaced; hooks are removed",()=>{
  const h=mainHarness();h.load();
  h.run(`self = globalThis; self.${KEY}=self.${KEY}||[]`);
  const unknown=[[1],{900823(){},62229(){}}];
  h.ctx[KEY].push(unknown);
  assert.equal(h.ctx[KEY][0],unknown);
  assert.equal(h.status().state,"unsupported");
  assert.equal(h.status().reason,"factory-mismatch");
  assert.equal(Object.getOwnPropertyDescriptor(h.ctx,KEY).get,undefined);
  assert.equal(Object.hasOwn(h.ctx[KEY],"push"),false);
});
test("initializing late does not rewrite already queued modules",()=>{
  const h=mainHarness();h.ctx[KEY]=[[[1],{}]]; h.load();
  assert.equal(h.status().reason,"already-initialized");
  assert.equal(h.ctx[KEY].length,1);
});
test("unknown page times out without leaving an accessor",()=>{
  const h=mainHarness();h.load();[...h.timers.values()][0]();
  assert.equal(h.status().reason,"target-not-observed");
  assert.equal(Object.getOwnPropertyDescriptor(h.ctx,KEY).get,undefined);
});
test("runtime chaining does not recurse and unknown modules pass through",()=>{
  const h=mainHarness();h.load();
  h.run(`self=globalThis; self.${KEY}=[];
    const parent=self.${KEY}.push.bind(self.${KEY});
    self.${KEY}.push=function(chunk){return parent(chunk)};`);
  const value=[[123],{42(){}}];h.ctx[KEY].push(value);
  assert.equal(h.ctx[KEY][0],value);
  assert.equal(h.status().state,"waiting");
});
test("actual vendor factories are replaced atomically before a chained runtime sees them",{skip:!vendor},()=>{
  const h=mainHarness();h.load();
  h.run(`self=globalThis; self.${KEY}=[];
    const parent=self.${KEY}.push.bind(self.${KEY});
    self.${KEY}.push=function(chunk){globalThis.seen=chunk;return parent(chunk)};`);
  const originals=[vendor[1][900823],vendor[1][62229]];
  h.ctx[KEY].push(vendor);
  const patched=h.ctx.seen;
  assert.equal(h.status().state,"optimized");
  assert.notEqual(patched[1][900823],originals[0]);assert.notEqual(patched[1][62229],originals[1]);
  assert.equal(vendor[1][900823],originals[0]);assert.equal(vendor[1][62229],originals[1]);
  assert.equal(patched[1][837720],vendor[1][837720]);
  assert.equal(Object.getOwnPropertyDescriptor(h.ctx,KEY).get,undefined);
  assert.equal(Object.getOwnPropertyDescriptor(h.ctx[KEY],"push").get,undefined);
});
test("matching functions on a different script URL are left untouched",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);
  h.ctx.document.currentScript.src="https://example.com/main.vendors.ed520e7e.js";
  h.ctx[KEY].push(vendor);
  assert.equal(h.status().reason,"script-url-mismatch");
  assert.equal(h.ctx[KEY][0],vendor);
});
test("company vendor filename and query can change when both factory hashes match",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);
  h.ctx.document.currentScript.src="https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.80098539.js?build=company";
  h.ctx[KEY].push(vendor);
  assert.equal(h.status().state,"optimized");
  assert.equal(h.diagnose().inspection.scriptFile,"main.vendors.80098539.js");
  assert.equal(h.diagnose().inspection.modules[900823].matches,true);
  assert.equal(h.diagnose().inspection.modules[62229].matches,true);
});
test("a new vendor filename does not bypass the factory hash check",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);
  h.ctx.document.currentScript.src="https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.80098539.js";
  const altered=[vendor[0],{...vendor[1],62229(){}}];h.ctx[KEY].push(altered);
  assert.equal(h.status().reason,"factory-mismatch");assert.equal(h.ctx[KEY][0],altered);
});
test("one changed factory prevents either module from being replaced",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);
  const altered=[vendor[0],{...vendor[1],62229(){}}];h.ctx[KEY].push(altered);
  assert.equal(h.status().reason,"factory-mismatch");
  assert.equal(h.ctx[KEY][0],altered);
});
test("diagnostic exposes only metadata and hashes, including script URL mismatch",{skip:!vendor},()=>{
 const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);
 h.ctx.document.currentScript.src="https://example.com/private/path/main.vendors.NEW.js?token=SECRET_QUERY#private";
 h.ctx[KEY].push(vendor);
 const status=h.status();assert.equal(Object.hasOwn(status,"inspection"),false);
 const result=h.diagnose();assert.equal(result.reason,"script-url-mismatch");assert.equal(result.diagnostic,true);
 assert.equal(result.inspection.scriptFile,"main.vendors.NEW.js");assert.equal(result.inspection.scriptHost,"example.com");
 assert.equal(result.inspection.modules[900823].matches,true);assert.equal(result.inspection.modules[62229].matches,true);
 assert.match(result.inspection.modules[900823].hash,/^[a-f0-9]{64}$/);
 assert.equal(JSON.stringify(result).includes("SECRET_QUERY"),false);assert.equal(JSON.stringify(result).includes("private/path"),false);
 assert.equal(h.ctx[KEY][0],vendor);
});
test("a page locking the global accessor does not drop or replace a chunk",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[];
    Object.defineProperty(globalThis,'${KEY}',{...Object.getOwnPropertyDescriptor(globalThis,'${KEY}'),configurable:false});`);
  h.ctx[KEY].push(vendor);
  assert.equal(h.ctx[KEY][0],vendor);assert.equal(h.status().state,"error");
  assert.equal(h.status().reason,"restoration-failed");
});

function reactHarness(factories) {
  let current;
  const dependencies={};
  const React={
    createContext(value){const ctx={current:value,Consumer:{}};ctx.Provider={context:ctx};return ctx;},
    createElement(provider,props,children){provider.context.current=props.value;return{props,children};},
    useContext(context){return context.current;},
    useRef(value){const index=current.cursor++;return current.hooks[index]??=( {current:value} );},
    useReducer(reducer,initial){const component=current,index=current.cursor++;component.hooks[index]??=initial;return[component.hooks[index],()=>{component.updates++;component.hooks[index]=reducer(component.hooks[index]);}];}
  };
  const effect= (callback,deps)=>{
    const component=current,index=current.cursor++,previous=component.hooks[index];
    const changed=!previous||!deps||deps.some((dep,i)=>!Object.is(dep,previous.deps?.[i]));
    if(changed) component.effects.push(()=>{previous?.cleanup?.();component.hooks[index]={deps,cleanup:callback()};});
  };
  dependencies[104553]=React;dependencies[203125]={E:effect};
  dependencies[873177]={unstable_NormalPriority:3,unstable_runWithPriority:(_,fn)=>fn()};
  const require=id=>dependencies[id];
  require.d=(exports,getters,values={})=>{for(const[key,get]of Object.entries(getters))Object.defineProperty(exports,key,{get});Object.assign(exports,values);};
  const provider={},consumer={};factories[900823]({},provider,require);factories[62229]({},consumer,require);
  function component(fn){return{fn,hooks:[],effects:[],cursor:0,updates:0};}
  function render(c,...args){current=c;c.cursor=0;c.effects=[];const value=c.fn(...args);c.effects.forEach(fn=>fn());current=null;return value;}
  function unmount(c){for(const hook of c.hooks)hook?.cleanup?.();}
  return{create:provider.q,select:consumer.i,component,render,unmount};
}
function hookScenario(factories) {
  const h=reactHarness(factories),ctx=h.create({x:1});
  const provider=h.component(ctx.Provider),selector=value=>value.x;
  h.render(provider,{value:{x:1},children:"child"});
  const a=h.component(()=>h.select(ctx,selector)),b=h.component(()=>h.select(ctx,selector));
  const log=[h.render(a),h.render(b)];
  h.render(provider,{value:{x:2}});log.push(a.updates,b.updates,h.render(a),h.render(b));
  h.unmount(a);h.render(provider,{value:{x:3}});log.push(a.updates,b.updates,h.render(b));
  h.unmount(b);h.unmount(b);h.render(provider,{value:{x:4}});log.push(a.updates,b.updates);
  return log;
}
test("replacement provider and hook agree with actual original modules over mount/update/unmount",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);h.ctx[KEY].push(vendor);
  assert.deepEqual(hookScenario(h.ctx[KEY][0][1]),hookScenario(vendor[1]));
  assert.equal(Object.hasOwn(h.status(),"metrics"),false);
});
test("replacement reports runtime exceptions without swallowing them",{skip:!vendor},()=>{
  const h=mainHarness();h.load();h.run(`globalThis.${KEY}=[]`);h.ctx[KEY].push(vendor);
  const react=reactHarness(h.ctx[KEY][0][1]);
  const context=react.create({x:1});
  const component=react.component(()=>react.select(context,()=>{throw Error("selector failure");}));
  assert.throws(()=>react.render(component),/selector failure/);
  assert.equal(h.status().state,"error");assert.equal(h.status().reason,"runtime-failed");
});
