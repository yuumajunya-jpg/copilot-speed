"use strict";
const fs=require("node:fs"),path=require("node:path"),vm=require("node:vm");
const {performance}=require("node:perf_hooks");
const ctx=vm.createContext({performance});
vm.runInContext(fs.readFileSync(path.resolve(__dirname,"../extension/lib/registry.js"),"utf8"),ctx);
function nativeStore(){const array=[];return{subscribe(fn){array.push(fn);return()=>{const i=array.indexOf(fn);if(i!==-1)array.splice(i,1);};},notify(){array.forEach(fn=>fn());}};}
function optimizedStore(){const r=ctx.__cllCreateRegistry();return{subscribe:fn=>r.subscribe(fn),notify:()=>r.forEach(fn=>fn())};}
function measure(make,n,order){const store=make(),off=[];const start=performance.now();for(let i=0;i<n;i++)off.push(store.subscribe(()=>{}));const registration=performance.now()-start;const notifyStart=performance.now();for(let i=0;i<10;i++)store.notify();const notification=(performance.now()-notifyStart)/10;if(order==="LIFO")off.reverse();const cleanupStart=performance.now();off.forEach(fn=>fn());return{registrationMs:registration,notificationMs:notification,cleanupMs:performance.now()-cleanupStart};}
const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
for(let i=0;i<3;i++){measure(nativeStore,1000,"FIFO");measure(optimizedStore,1000,"FIFO");}
const rows=[];
for(const n of [1000,10000,50000])for(const order of ["FIFO","LIFO"]){
 const samples={native:[],optimized:[]};
 for(let round=0;round<5;round++)for(const[kind,make]of round%2?[["optimized",optimizedStore],["native",nativeStore]]:[["native",nativeStore],["optimized",optimizedStore]])samples[kind].push(measure(make,n,order));
 const result={n,order};for(const kind of Object.keys(samples))result[kind]=Object.fromEntries(["registrationMs","notificationMs","cleanupMs"].map(key=>[key,Number(median(samples[kind].map(s=>s[key])).toFixed(3))]));
 rows.push(result);
}
const report={node:process.version,platform:process.platform,rounds:5,notificationRepeats:10,note:"Synthetic registry benchmark, not Copilot end-to-end latency.",rows};
const destination=path.resolve(__dirname,"../test-results");fs.mkdirSync(destination,{recursive:true});
fs.writeFileSync(path.join(destination,"benchmark.json"),JSON.stringify(report,null,2));
console.table(rows.map(r=>({N:r.n,order:r.order,"array cleanup ms":r.native.cleanupMs,"linked cleanup ms":r.optimized.cleanupMs,"array notify ms":r.native.notificationMs,"linked notify ms":r.optimized.notificationMs})));
