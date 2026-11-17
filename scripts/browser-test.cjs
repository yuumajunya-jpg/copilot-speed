"use strict";
const path=require("node:path"),fs=require("node:fs"),assert=require("node:assert/strict");
process.env.PLAYWRIGHT_BROWSERS_PATH??=path.resolve(__dirname,"../.cache/browsers");
const {chromium}=require("playwright-core");
const root=path.resolve(__dirname,".."),out=path.join(root,"test-results");
const vendorURL="https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.ed520e7e.js";
const reference=path.join(root,"research/vendors.js"),hasReference=fs.existsSync(reference);
let wrongVendor=false, changedScriptURL=false;
const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Copilot fixture</title><main><div role="log"></div><textarea aria-label="Message"></textarea><button aria-label="Send message">Send</button></main>
<script src="${vendorURL}"></script><script>
const input=document.querySelector('textarea');
function send(){if(!input.value.trim())return;const div=document.createElement('div');div.textContent='fixture message';document.querySelector('[role=log]').append(div);input.value='';}
document.querySelector('button').addEventListener('click',send);
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey)send();});
</script></html>`;
async function until(fn,check,timeout=6000){const start=Date.now();let last;while(Date.now()-start<timeout){last=await fn();if(check(last))return last;await new Promise(resolve=>setTimeout(resolve,80));}throw Error(`Timed out: ${JSON.stringify(last)}`);}
async function harness(extensionPath,url){
 const context=await chromium.launchPersistentContext("",{headless:true,channel:"chromium",
  args:[`--disable-extensions-except=${extensionPath}`,`--load-extension=${extensionPath}`]});
 try{
  const errors=[];context.on("page",page=>page.on("pageerror",error=>errors.push(error.message)));
  await context.route("https://**/*",async route=>{
   const requestURL=route.request().url();
   if(requestURL===vendorURL||requestURL.startsWith(vendorURL+"?"))await route.fulfill({contentType:"text/javascript",body:!wrongVendor&&hasReference?fs.readFileSync(reference,"utf8"):'(self.rspackChunk_1js_m365_copilot_app=self.rspackChunk_1js_m365_copilot_app||[]).push([[581856],{900823(){},62229(){}}]);'});
   else if(["copilot.com","copilot.cloud.chat"].includes(new URL(requestURL).hostname))await route.fulfill({contentType:"text/html; charset=utf-8",body:fixture.replace(vendorURL,changedScriptURL?vendorURL+"?token=SCRIPT_PRIVATE_QUERY":vendorURL)});
   else await route.abort();
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
  const id=new URL(worker.url()).host;
  await until(()=>worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts()),scripts=>scripts.some(script=>script.id==="cll-status"));
  const page=await context.newPage();await page.goto(url);
  const tabId=await worker.evaluate(async origin=>(await chrome.tabs.query({url:`${origin}/*` }))[0].id,new URL(url).origin);
  const popup=await context.newPage();await page.bringToFront();await popup.goto(`chrome-extension://${id}/popup.html`);
  const status=()=>worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:"status"}),tabId);
  return{context,worker,page,popup,tabId,status,errors};
 }catch(error){await context.close();throw error;}
}
async function run(){
 fs.mkdirSync(out,{recursive:true});
 const h=await harness(path.join(root,"extension"),"https://copilot.com/");
 let browserVersion;
 try{
  const{context,worker,page,popup,status,errors}=h;
  browserVersion=context.browser().version();
  await until(status,s=>s.enabled===false);
  assert.equal(await popup.locator("input").count(),1);assert.equal(await popup.locator("button:visible").count(),1);
  assert.equal(await popup.locator("#diagnosis").isHidden(),true);
  assert.doesNotMatch(await popup.locator("body").innerText(),/実験|未検証|購読|計測|配布コード|対象 URL を設定/);
  assert.equal(await worker.evaluate(()=>Boolean(chrome.runtime.getManifest().options_ui)),false);
  await page.locator("textarea").fill("private prompt");await page.locator("button").click();
  await page.locator("textarea").fill("another private prompt");await page.locator("textarea").press("Enter");
  assert.equal(await page.locator('[role="log"] > div').count(),2);
  assert.deepEqual(Object.keys(await status()).sort(),["enabled","main"]);
  await popup.locator("#optimization").click();await until(status,s=>s.enabled);
  assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,2);
  await page.reload();const applied=await until(status,s=>s.main&&s.main.state!=="waiting");
  assert.equal(applied.main.state,hasReference?"optimized":"unsupported");assert.deepEqual(Object.keys(applied.main).sort(),["reason","state"]);
  if(hasReference)assert.equal(await page.evaluate(()=>self.rspackChunk_1js_m365_copilot_app.find(chunk=>chunk[1][900823])[1][900823].name),"providerFactory");
  await popup.evaluate(()=>refresh());await popup.locator("body").screenshot({path:path.join(out,"popup.png")});
  await page.locator("textarea").fill("PROMPT_PRIVATE_DO_NOT_SAVE");
  await popup.locator("#diagnose").click();
  await until(()=>popup.locator("#diagnosis-code").innerText(),text=>text.includes(hasReference?"OK":"D02"));
  assert.equal(JSON.stringify(await popup.evaluate(()=>diagnosticReport)).includes("PROMPT_PRIVATE_DO_NOT_SAVE"),false);
  wrongVendor=true;await page.reload();const mismatch=await until(status,s=>s.main?.state==="unsupported");assert.equal(mismatch.main.reason,"factory-mismatch");
  await popup.evaluate(()=>refresh());assert.doesNotMatch(await popup.locator("body").innerText(),/factory|配布|ハッシュ|モジュール/);
  await popup.locator("#diagnose").click();await until(()=>popup.locator("#diagnosis-code").innerText(),text=>text.includes("D02"));
  const diagnosed=await popup.evaluate(()=>diagnosticReport);assert.equal(diagnosed.optimizer.reason,"factory-mismatch");
  assert.equal(diagnosed.optimizer.inspection.modules[900823].matches,false);
  assert.ok(diagnosed.environment.scripts.some(script=>script.file==="main.vendors.ed520e7e.js"));
  const downloadWait=popup.waitForEvent("download");await popup.locator("#save-diagnosis").click();
  const download=await downloadWait;await download.saveAs(path.join(out,"browser-diagnosis.json"));
  assert.equal(JSON.parse(fs.readFileSync(path.join(out,"browser-diagnosis.json"),"utf8")).code,"D02");
  await popup.locator("body").screenshot({path:path.join(out,"diagnosis.png")});
  wrongVendor=false;changedScriptURL=true;
  await page.goto("https://copilot.com/chat?conversation=PAGE_PRIVATE_QUERY#private");
  await until(status,s=>s.main?.reason==="script-url-mismatch");
  await popup.locator("#diagnose").click();await until(()=>popup.locator("#diagnosis-code").innerText(),text=>text.includes("D01"));
  const urlReport=JSON.stringify(await popup.evaluate(()=>diagnosticReport));assert.doesNotMatch(urlReport,/SCRIPT_PRIVATE_QUERY|PAGE_PRIVATE_QUERY/);
  await popup.locator("#optimization").click();await until(status,s=>!s.enabled);
  await page.reload();await until(status,s=>s.enabled===false&&s.main===null);assert.deepEqual(errors,[]);
 }finally{await h.context.close();}

 // Only edit the manifest in a test copy: no UI, generated config, or other code changes.
 const configured=fs.mkdtempSync(path.join(out,"configured-extension-"));
 fs.cpSync(path.join(root,"extension"),configured,{recursive:true});
 const manifest=JSON.parse(fs.readFileSync(path.join(configured,"manifest.json"),"utf8"));
 const pattern="https://copilot.cloud.chat/chat/*";
 manifest.host_permissions=[pattern];fs.writeFileSync(path.join(configured,"manifest.json"),JSON.stringify(manifest,null,2));
 wrongVendor=false;changedScriptURL=false;
 const custom=await harness(configured,"https://copilot.cloud.chat/chat/thread");
 try{
  const{worker,page,popup,tabId,status,errors}=custom;
  await until(status,s=>s.enabled===false);
  await popup.evaluate(()=>refresh());assert.equal(await popup.locator("#optimization").isEnabled(),true);
  const scripts=await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts());
  assert.equal(scripts.find(script=>script.id==="cll-status").matches[0],pattern);
  // A missing page script must not prevent changing the enabled setting.
  await worker.evaluate(()=>chrome.scripting.unregisterContentScripts({ids:["cll-status"]}));await page.reload();
  await popup.evaluate(()=>refresh());assert.equal(await popup.locator("#optimization").isEnabled(),true);
  await popup.locator("#optimization").click();
  await until(()=>worker.evaluate(()=>chrome.storage.local.get("enabledPatterns")),s=>s.enabledPatterns?.[pattern]===true);
  await page.reload();await until(status,s=>s.main?.state===(hasReference?"optimized":"unsupported"));
  await page.goto("https://copilot.cloud.chat/other");await popup.evaluate(()=>refresh());
  assert.equal(await popup.locator("#optimization").isDisabled(),true);
  assert.equal(await worker.evaluate(async id=>{try{await chrome.tabs.sendMessage(id,{type:"status"});return true;}catch{return false;}},tabId),false);
  assert.notEqual(await page.evaluate(()=>self.rspackChunk_1js_m365_copilot_app.find(chunk=>chunk[1][900823])[1][900823].name),"providerFactory");
  assert.deepEqual(errors,[]);
 }finally{await custom.context.close();}
 const result={browser:browserVersion,referenceModuleTest:hasReference,checks:[
  "extension loading","simple popup without URL settings UI","no diagnostics payload","normal click and Enter sending",
  "dynamic MAIN registration","reload application","factory mismatch non-application","user-facing status messages","disable and reload",
  "manifest-only custom host configuration","path-restricted detection and injection","toggle works before page script reload","outside path stays unmodified",
  "on-demand diagnostic reason codes","factory diagnostic metadata","diagnostic JSON download","script URL diagnostic and query redaction"]};
 fs.writeFileSync(path.join(out,"browser-test.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
run().catch(error=>{console.error(error);process.exitCode=1;});
