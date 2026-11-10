import { build } from "esbuild";
import { writeFile, mkdir } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/chemicals/backup-updater.js"],
  bundle: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["chrome100", "firefox100", "safari15.4"],
  minify: true,
});
const style =
  "body{font:16px/1.6 Arial,sans-serif;color:#243329;max-width:950px;padding:28px;margin:auto}h1{font-size:26px}h2{font-size:20px}button{background:#235c37;color:white;border:0;border-radius:3px;padding:12px 18px;font:inherit;cursor:pointer;margin:20px 0}button:disabled{background:#8b938b;cursor:not-allowed}input{display:block;padding:15px 0}table{border-collapse:collapse;width:100%;font-size:13px;text-align:left}td,th{padding:12px;border-bottom:1px solid #ddd;vertical-align:top}summary{cursor:pointer;color:#235c37}footer{color:#627064;font-size:13px;margin-top:40px}";
await mkdir("standalone", { recursive: true });
await writeFile(
  "standalone/Shemberg-Backup-Updater.html",
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Shemberg backup updater</title><style>${style}</style></head><body><main id="updater"></main><script>${result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script")}</script></body></html>`,
);
