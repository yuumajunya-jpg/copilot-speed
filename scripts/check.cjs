"use strict";
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname,"../extension");
const manifest = JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
let count = 0;
function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes:true })) {
    const file = path.join(dir,item.name);
    if (item.isDirectory()) walk(file);
    else if (file.endsWith(".js")) { new vm.Script(fs.readFileSync(file,"utf8"), { filename:file }); count++; }
  }
}
walk(root);
for (const file of [manifest.background.service_worker, manifest.action.default_popup,
  ...(manifest.content_scripts ?? []).flatMap(s => s.js), "lib/targets.js", "lib/status.js", "content.js",
  "lib/sha256.js", "lib/registry.js", "main.js", "popup.css", "popup.js"]) {
  if (!fs.existsSync(path.join(root,file))) throw new Error(`Missing: ${file}`);
}
if (manifest.host_permissions.some(host => host.includes("*://") || host.includes("<all_urls>"))) throw new Error("Overbroad hosts");
const ctx = vm.createContext({URL});
vm.runInContext(fs.readFileSync(path.join(root,"lib/targets.js"),"utf8"),ctx);
ctx.CopilotSpeedTargets.normalizePatterns(manifest.host_permissions);
console.log(`Manifest / ${count} JavaScript files: OK`);
