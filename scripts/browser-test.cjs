"use strict";
const path=require("node:path"),fs=require("node:fs"),assert=require("node:assert/strict");
process.env.PLAYWRIGHT_BROWSERS_PATH??=path.resolve(__dirname,"../.cache/browsers");
const {chromium}=require("playwright-core");
const root=path.resolve(__dirname,".."),out=path.join(root,"test-results");
const vendorURL="https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.ed520e7e.js";
const reference=path.join(root,"research/vendors.js"),hasReference=fs.existsSync(reference);
let wrongVendor=false;
const fixture=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>Copilot fixture</title><main><div role="log"></div><textarea aria-label="Message"></textarea><button aria-label="Send message">Send</button></main>
<script src="${vendorURL}"></script><script>
const input=document.querySelector('textarea');
function send(){if(!input.value.trim())return;const div=document.createElement('div');div.textContent='fixture message';document.querySelector('[role=log]').append(div);input.value='';}
document.querySelector('button').addEventListener('click',send);
input.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&!event.shiftKey&&!event.ctrlKey&&!event.altKey&&!event.metaKey)send();});
</script></html>`;
async function until(fn,check,timeout=6000){const start=Date.now();let last;while(Date.now()-start<timeout){last=await fn();if(check(last))return last;await new Promise(resolve=>setTimeout(resolve,80));}throw Error(`Timed out: ${JSON.stringify(last)}`);}
async function run(){
 fs.mkdirSync(out,{recursive:true});
 const context=await chromium.launchPersistentContext("",{headless:true,channel:"chromium",
  args:[`--disable-extensions-except=${path.join(root,"extension")}`,`--load-extension=${path.join(root,"extension")}`]});
 try{
  await context.route("https://**/*",async route=>{
   const url=route.request().url();
   if(url===vendorURL)await route.fulfill({contentType:"text/javascript",body:!wrongVendor&&hasReference?fs.readFileSync(reference,"utf8"):'(self.rspackChunk_1js_m365_copilot_app=self.rspackChunk_1js_m365_copilot_app||[]).push([[581856],{900823(){},62229(){}}]);'});
   else if(url.startsWith("https://copilot.com/"))await route.fulfill({contentType:"text/html; charset=utf-8",body:fixture});
   else await route.abort();
  });
  const worker=context.serviceWorkers()[0]??await context.waitForEvent("serviceworker");
  const id=new URL(worker.url()).host;
  const page=await context.newPage();await page.goto("https://copilot.com/");
  const tabId=await worker.evaluate(async()=>{const tabs=await chrome.tabs.query({url:"https://copilot.com/*"});return tabs[0].id;});
  const popup=await context.newPage();await page.bringToFront();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  const errors=[];popup.on("pageerror",error=>errors.push(error.message));page.on("pageerror",error=>errors.push(error.message));
  const status=()=>worker.evaluate(id=>chrome.tabs.sendMessage(id,{type:"status"}),tabId);
  await until(status,s=>s.enabled===false);
  assert.equal(await popup.locator("input").count(),1);
  assert.equal(await popup.locator("button").count(),0);
  assert.doesNotMatch(await popup.locator("body").innerText(),/実験|未検証|購読|診断|計測|配布コード/);
  await page.locator("textarea").fill("private prompt");await page.locator("button").click();
  await page.locator("textarea").fill("another private prompt");await page.locator("textarea").press("Enter");
  assert.equal(await page.locator('[role="log"] > div').count(),2);
  assert.deepEqual(Object.keys(await status()).sort(),["enabled","main"]);
  await popup.locator("#optimization").click();await until(status,s=>s.enabled);
  assert.equal((await worker.evaluate(()=>chrome.scripting.getRegisteredContentScripts())).length,1);
  await page.reload();
  const applied=await until(status,s=>s.main && s.main.state!=="waiting");
  assert.equal(applied.main.state,hasReference?"optimized":"unsupported");
  assert.deepEqual(Object.keys(applied.main).sort(),["reason","state"]);
  if(hasReference)assert.equal(await page.evaluate(()=>self.rspackChunk_1js_m365_copilot_app.find(chunk=>chunk[1][900823])[1][900823].name),"providerFactory");
  await popup.evaluate(()=>refresh());
  await popup.locator("body").screenshot({path:path.join(out,"popup.png")});
  wrongVendor=true;await page.reload();
  const mismatch=await until(status,s=>s.main?.state==="unsupported");assert.equal(mismatch.main.reason,"factory-mismatch");
  await popup.evaluate(()=>refresh());
  assert.doesNotMatch(await popup.locator("body").innerText(),/factory|配布|ハッシュ|モジュール/);
  await popup.locator("#optimization").click();await until(status,s=>!s.enabled);
  await page.reload();await until(status,s=>s.enabled===false&&s.main===null);
  assert.deepEqual(errors,[]);
  const result={browser:context.browser().version(),referenceModuleTest:hasReference,
   checks:["extension loading","simple popup","no diagnostics payload","normal click and Enter sending",
    "dynamic MAIN registration","reload application","factory mismatch non-application","user-facing status messages","disable and reload"]};
  fs.writeFileSync(path.join(out,"browser-test.json"),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await context.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
