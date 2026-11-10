import { build } from "esbuild";
import { mkdir, writeFile, readFile } from "node:fs/promises";
const result = await build({
  entryPoints: ["src/chemicals/main.js"],
  bundle: true,
  write: false,
  outdir: "standalone",
  format: "iife",
  platform: "browser",
  target: ["chrome100", "firefox100", "safari15.4"],
  minify: true,
  legalComments: "inline",
  loader: { ".avif": "dataurl", ".ttf": "dataurl", ".txt": "text" },
  plugins: [
    {
      name: "inline-resources",
      setup(b) {
        b.onResolve(
          { filter: /\.(?:avif|ttf)\?inline$|\.txt\?raw$/ },
          async (args) => ({
            path: (await import("node:path")).resolve(
              args.resolveDir,
              args.path.replace(/\?(?:inline|raw)$/, ""),
            ),
          }),
        );
      },
    },
  ],
});
const js = result.outputFiles.find((f) => f.path.endsWith(".js")).text;
const css = result.outputFiles.find((f) => f.path.endsWith(".css")).text;
const seedIndex = process.argv.indexOf("--seed"),
  outIndex = process.argv.indexOf("--out");
const seed =
  seedIndex >= 0
    ? JSON.parse(await readFile(process.argv[seedIndex + 1], "utf8"))
    : null;
const embedded = seed
  ? `<script type="application/json" id="shemberg-seed">${JSON.stringify(seed).replace(/</g, "\\u003c")}</script>`
  : "";
const output =
  outIndex >= 0
    ? process.argv[outIndex + 1]
    : "standalone/Shemberg-Chemicals-Inventory.html";
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#133f35"><title>Shemberg | QA Chemicals Inventory — Offline</title><style>${css.replace(/<\/style/gi, "<\\/style")}</style></head><body>${embedded}<div id="chem-app"></div><script>${js.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await mkdir("standalone", { recursive: true });
await writeFile(output, html);
console.log(
  `Offline chemicals app: ${html.length.toLocaleString()} characters.`,
);
