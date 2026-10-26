import { build } from "esbuild";
import { resolve } from "node:path";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  write: false,
  outdir: "standalone",
  format: "iife",
  platform: "browser",
  target: ["chrome100", "firefox100", "safari15.4"],
  minify: true,
  legalComments: "inline",
  loader: { ".png": "dataurl" },
  plugins: [
    {
      name: "inline-image",
      setup(build) {
        build.onResolve({ filter: /\.png\?inline$/ }, (args) => ({
          path: resolve(args.resolveDir, args.path.replace(/\?inline$/, "")),
        }));
      },
    },
  ],
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Shemberg Inventory — Offline App</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await mkdir("standalone", { recursive: true });
await writeFile("standalone/Shemberg-Inventory.html", html);
console.log(
  `Created standalone/Shemberg-Inventory.html (${html.length.toLocaleString()} characters). Open directly in a browser; no server or installation required.`,
);
