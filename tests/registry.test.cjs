"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {registryFactory} = require("./helpers.cjs");
const createRegistry = registryFactory();

function nativeRegistry() {
  const listeners = [];
  return { subscribe(callback) {
    // The real hook creates a fresh listener closure for each registration.
    const listener = value => callback(value);
    listeners.push(listener);
    return () => { const i=listeners.indexOf(listener); if(i!==-1) listeners.splice(i,1); };
  }, forEach(callback) { listeners.forEach(callback); } };
}
function scenario(make, seed) {
  const store = make();
  let state = seed, nextId=0, depth=0;
  const rng = () => { state=(Math.imul(state,1664525)+1013904223)>>>0; return state/2**32; };
  const subscriptions = [];
  const log = [];
  function add() {
    const id=nextId++;
    subscriptions.push(store.subscribe(() => {
      log.push(id);
      const action=rng();
      if(action<.2 && subscriptions.length) subscriptions[Math.floor(rng()*subscriptions.length)]();
      else if(action<.3 && nextId<100) add();
      else if(action<.33 && depth===0) { depth++; store.forEach(fn=>fn()); depth--; }
    }));
  }
  for(let i=0;i<8;i++) add();
  for(let i=0;i<100;i++) {
    const action=rng();
    if(action<.35 && nextId<100) add();
    else if(action<.65 && subscriptions.length) subscriptions[Math.floor(rng()*subscriptions.length)]();
    else store.forEach(fn=>fn());
  }
  subscriptions.forEach(unsubscribe=>unsubscribe());
  store.forEach(fn=>fn());
  return log;
}
test("registration/notification/removal match native live arrays, including reentry (200 seeds)",()=>{
  for(let seed=1;seed<=200;seed++) assert.deepEqual(scenario(()=>createRegistry(),seed),scenario(nativeRegistry,seed),`seed ${seed}`);
});
test("duplicate callbacks and idempotent cleanup",()=>{
  const store=createRegistry();
  let calls=0;
  const callback=()=>calls++;
  const a=store.subscribe(callback),b=store.subscribe(callback);
  store.forEach(fn=>fn());
  assert.equal(calls,2);
  b(); b(); store.forEach(fn=>fn());
  assert.equal(calls,3);
  a(); store.forEach(fn=>fn()); assert.equal(calls,3);
});
test("notification still works after an exception",()=>{
  const store=createRegistry();
  const off=store.subscribe(()=>{throw new Error("expected");});
  assert.throws(()=>store.forEach(fn=>fn()),/expected/);
  off();
  let calls=0;
  const next=store.subscribe(()=>{calls++;});
  store.forEach(fn=>fn()); next();
  store.forEach(fn=>fn()); assert.equal(calls,1);
});
