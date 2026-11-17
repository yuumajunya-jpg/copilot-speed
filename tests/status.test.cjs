"use strict";
const test=require("node:test"),assert=require("node:assert/strict"),vm=require("node:vm");
const {source}=require("./helpers.cjs");
const ctx=vm.createContext({});vm.runInContext(source("lib/status.js"),ctx);
const {validateMain,validateDiagnostic}=ctx.CopilotSpeedStatus;
test("status accepts only known values and drops all other fields",()=>{
 const input={state:"optimized",reason:"verified-factories",adapter:"fluent-context-ed520e7e-v1",metrics:{active:123},prompt:"private"};
 const output=validateMain(input);
 assert.equal(JSON.stringify(output),JSON.stringify({state:"optimized",reason:"verified-factories"}));
 for(const value of [null,{}, {...input,state:"fake"},{...input,reason:"fake"},{...input,adapter:"fake"}])assert.equal(validateMain(value),null);
});
test("diagnostic accepts bounded checks and drops page-supplied extra content",()=>{
 const input={state:"unsupported",reason:"factory-mismatch",adapter:"fluent-context-ed520e7e-v1",diagnostic:true,
  inspection:{scriptHost:"example.com",scriptFile:"main.js",prompt:"private",modules:{900823:{present:true,matches:false,hash:"a".repeat(64),source:"private"},62229:{present:false,matches:false,hash:null}}}};
 const result=validateDiagnostic(input);assert.ok(result);assert.equal(JSON.stringify(result).includes("private"),false);
 assert.equal(validateDiagnostic({...input,inspection:{...input.inspection,scriptFile:"main.js?token=secret"}}),null);
 assert.equal(validateDiagnostic({...input,inspection:{...input.inspection,modules:{}}}),null);
 assert.equal(validateDiagnostic({...input,diagnostic:false}),null);
});
