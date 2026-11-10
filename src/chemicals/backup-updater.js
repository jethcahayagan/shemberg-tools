import base from "./catalog.json";
import supplement from "./inventory-supplement.json";
import { validateBackup, chemicalRegistry } from "./core.js";
import { updateInventoryBackup } from "./numbering.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
let prepared = null;
document.querySelector("#updater").innerHTML =
  `<h1>Shemberg chemical backup updater</h1><p>Choose your existing JSON backup. This tool creates an updated copy locally. It does not upload records or overwrite your original file.</p><label>Current backup <input type="file" id="backup" accept=".json,application/json"></label><div id="message" role="status"></div><button id="download" disabled>Download updated JSON backup</button><p>Then open Shemberg-Chemicals-Inventory.html and use Backups &amp; guide → Restore backup.</p><p>Numbering follows the existing registry: OLD STOCK CHEM-066 or CHEM-066, with bottles such as 1/3 RAW-041. Immutable record keys and all original log entries are retained. New definitions from the November spreadsheet have no invented quantities.</p><p>Source identity conflicts remain for label/SDS review. No formula, weight, expiry, supplier, lot or log entry is silently corrected.</p><footer>© ${new Date().getFullYear()} Jermaine Theus Cahayagan</footer>`;
document.querySelector("#backup").onchange = async (e) => {
  prepared = null;
  document.querySelector("#download").disabled = true;
  try {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 30 * 1024 * 1024) throw Error("Backup exceeds 30 MB.");
    const original = validateBackup(JSON.parse(await file.text()));
    const updated = updateInventoryBackup(original, base, supplement, {
      analyst: "Backup registration updater",
      reason:
        "User-requested code, bottle-numbering and November 2026 list reconciliation",
    });
    validateBackup(updated);
    if (
      JSON.stringify(updated.events.slice(0, original.events.length)) !==
      JSON.stringify(original.events)
    )
      throw Error("Original logs failed the preservation check.");
    if (
      JSON.stringify(
        (updated.registryEvents || []).slice(
          0,
          (original.registryEvents || []).length,
        ),
      ) !== JSON.stringify(original.registryEvents || [])
    )
      throw Error("Registry history failed the preservation check.");
    for (const old of original.bottles) {
      const b = updated.bottles.find((x) => x.id === old.id);
      for (const k of [
        "balance",
        "gross",
        "tare",
        "lot",
        "supplier",
        "labCode",
        "formula",
        "formulaWeight",
        "received",
        "expiry",
      ])
        if (JSON.stringify(b[k]) !== JSON.stringify(old[k]))
          throw Error("Original " + k + " failed the preservation check.");
    }
    const changes = updated.bottles.filter((b) => {
      const old = original.bottles.find((x) => x.id === b.id);
      return (
        old.bottleId !== b.bottleId ||
        old.internalCode !== b.internalCode ||
        old.catalogId !== b.catalogId
      );
    });
    const added =
      chemicalRegistry(base, updated).length -
      chemicalRegistry(base, original).length;
    prepared = { ...updated, exportedAt: new Date().toISOString() };
    document.querySelector("#message").innerHTML =
      `<h2>Updated copy ready</h2><p>${original.bottles.length} bottle records kept · ${original.events.length} original log entries kept · ${changes.length} labels/links corrected · ${added} registry definitions added.</p><details><summary>Review changed codes and bottle labels</summary><table><thead><tr><th>Chemical</th><th>Previous</th><th>Updated</th></tr></thead><tbody>${changes
        .map((b) => {
          const old = original.bottles.find((x) => x.id === b.id);
          return `<tr><td>${esc(b.name)}</td><td>${esc(old.bottleId)}<br>${esc(old.internalCode)}</td><td>${esc(b.bottleId)}<br>${esc(b.internalCode)}</td></tr>`;
        })
        .join("")}</tbody></table></details>`;
    document.querySelector("#download").disabled = false;
  } catch (err) {
    document.querySelector("#message").textContent = err.message;
  }
};
document.querySelector("#download").onclick = () => {
  if (!prepared) return;
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(prepared, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    "Shemberg-Chemicals-backup-updated-" +
    new Date().toISOString().slice(0, 10) +
    ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
};
