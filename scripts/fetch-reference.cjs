"use strict";
// Development-only reference for differential tests; never shipped to the browser.
const fs=require("node:fs"),path=require("node:path"),crypto=require("node:crypto");
const url="https://res.public.onecdn.static.microsoft/midgard/versionless-v2/main.vendors.ed520e7e.js";
async function run(){
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 const hash=crypto.createHash("sha256").update(bytes).digest("hex");
 if(hash!=="9285892ca0d492804e3d6083d7344889cdeb1278b9fb5c202b7a09d4aa3eb792")throw Error("Reference hash mismatch; do not update adapter automatically.");
 const folder=path.resolve(__dirname,"../research");fs.mkdirSync(folder,{recursive:true});
 fs.writeFileSync(path.join(folder,"vendors.js"),bytes);
 console.log(`Reference verified: ${hash}`);
}
run().catch(error=>{console.error(error.message);process.exitCode=1;});
