"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname,"..");
const dist = path.join(root,"dist");
const destination = path.join(dist,"copilot-speed");
if (path.dirname(destination) !== dist || !destination.startsWith(root + path.sep)) throw new Error("Invalid package path");
execFileSync(process.execPath,[path.join(__dirname,"check.cjs")],{stdio:"inherit"});
if (fs.existsSync(destination)) {
  if (!fs.realpathSync(destination).startsWith(fs.realpathSync(root) + path.sep)) throw new Error("Package directory resolves outside the workspace");
  fs.rmSync(destination,{recursive:true,force:true});
}
fs.mkdirSync(destination,{recursive:true});
fs.cpSync(path.join(root,"extension"),destination,{recursive:true});
fs.copyFileSync(path.join(root,"INSTALL.md"),path.join(destination,"INSTALL.md"));
const version = JSON.parse(fs.readFileSync(path.join(root,"extension/manifest.json"),"utf8")).version;
const zip = path.join(dist,`copilot-speed-${version}.zip`);
execFileSync("powershell.exe",["-NoProfile","-NonInteractive","-Command",
  "Compress-Archive -LiteralPath $env:CLL_PACKAGE_FOLDER -DestinationPath $env:CLL_PACKAGE_ZIP -Force"],
  {stdio:"inherit",windowsHide:true,env:{...process.env,CLL_PACKAGE_FOLDER:destination,CLL_PACKAGE_ZIP:zip}});
console.log(`Extension: ${destination}\nZIP: ${zip}`);
