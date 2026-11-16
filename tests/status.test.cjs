"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
const ctx=vm.createContext({});vm.runInContext(source("lib/status.js"),ctx);
const {validateMain}=ctx.CopilotSpeedStatus;
test("status accepts only known values and drops all other fields",()=>{
 const input={state:"optimized",reason:"verified-factories",adapter:"fluent-context-ed520e7e-v1",metrics:{active:123},prompt:"private"};
 const output=validateMain(input);
 assert.equal(JSON.stringify(output),JSON.stringify({state:"optimized",reason:"verified-factories"}));
 for(const value of [null,{}, {...input,state:"fake"},{...input,reason:"fake"},{...input,adapter:"fake"}])assert.equal(validateMain(value),null);
});
