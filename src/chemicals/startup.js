import {
  emptyState,
  validateBackup,
  upgradeState,
  chemicalRegistry,
  id,
} from "./core.js";
import { updateInventoryBackup } from "./numbering.js";
export const DATA_VERSION = "2026-11-automatic-1";
const normalized = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function prepareInventory(
  input,
  base,
  additions,
  enrichment = [],
  options = {},
) {
  const original = validateBackup(input);
  if (original.appDataVersion === DATA_VERSION && !options.force)
    return upgradeState(original, chemicalRegistry(base, original));
  let updated = updateInventoryBackup(original, base, additions, {
    analyst: "Automatic app update",
    reason: "Install updated registry and registration numbering",
    ...options,
  });
  const overrides = new Map((updated.registry || []).map((c) => [c.id, c]));
  const history = [...(updated.registryEvents || [])];
  for (const patch of enrichment) {
    const candidates = chemicalRegistry(base, {
      ...updated,
      registry: [...overrides.values()],
    }).filter(
      (c) =>
        normalized(c.name) === normalized(patch.name) &&
        (!c.cas ||
          !patch.cas ||
          String(c.cas).trim().replace(/\.$/, "") === patch.cas),
    );
    for (const old of candidates) {
      const c = { ...old };
      let changed = false;
      for (const key of ["labCode", "classification", "storage", "hazards"])
        if (!String(c[key] || "").trim() && String(patch[key] || "").trim()) {
          c[key] = patch[key];
          changed = true;
        }
      if (!changed) continue;
      c.inventoryReference = c.inventoryReference || patch.inventoryReference;
      overrides.set(c.id, c);
      history.push({
        id: id(),
        chemicalId: c.id,
        at: options.now || new Date().toISOString(),
        type: "Registry information added",
        analyst: "Automatic app update",
        reason:
          "Fill blank registry fields from November inventory; existing bottle records retained",
        previous: { ...old },
        snapshot: { ...c },
      });
    }
  }
  updated = {
    ...updated,
    registry: [...overrides.values()],
    registryEvents: history,
    appDataVersion: DATA_VERSION,
  };
  // Updates may correct registration references, never measurements or original history.
  if (
    JSON.stringify(updated.events.slice(0, original.events.length)) !==
    JSON.stringify(original.events)
  )
    throw new Error("Original activity history failed validation.");
  if (
    JSON.stringify(
      updated.registryEvents.slice(0, (original.registryEvents || []).length),
    ) !== JSON.stringify(original.registryEvents || [])
  )
    throw new Error("Original registry history failed validation.");
  for (const b of original.bottles) {
    const next = updated.bottles.find((x) => x.id === b.id);
    if (!next) throw new Error("A previous bottle record is missing.");
    for (const key of [
      "balance",
      "gross",
      "tare",
      "supplier",
      "lot",
      "labCode",
      "formula",
      "formulaWeight",
      "received",
      "expiry",
      "opened",
      "openedBy",
      "deleted",
      "disposal",
    ])
      if (JSON.stringify(next[key]) !== JSON.stringify(b[key]))
        throw new Error("A protected bottle field changed: " + key);
  }
  return validateBackup(updated);
}
export function initializeInventory(
  storage,
  key,
  seed,
  base,
  additions,
  enrichment = [],
) {
  const raw = storage.getItem(key);
  const original =
    raw !== null
      ? validateBackup(JSON.parse(raw))
      : seed
        ? validateBackup(seed)
        : emptyState();
  const updated = prepareInventory(original, base, additions, enrichment);
  if (raw === null || original.appDataVersion !== DATA_VERSION) {
    if (raw !== null) {
      const recoveryKey = key + "-before-" + DATA_VERSION;
      if (storage.getItem(recoveryKey) === null)
        storage.setItem(recoveryKey, raw);
    }
    storage.setItem(key, JSON.stringify(updated));
  }
  return {
    state: updated,
    updated: raw === null || original.appDataVersion !== DATA_VERSION,
    source: raw !== null ? "browser" : seed ? "embedded" : "new",
  };
}
export function seedFromDocument(doc) {
  const node = doc.querySelector("#shemberg-seed");
  return node?.textContent.trim() ? JSON.parse(node.textContent) : null;
}
export function personalizedHtml(doc, state) {
  if (doc.querySelector("script[src]"))
    throw new Error(
      "Use the downloaded offline HTML app to save a complete portable copy.",
    );
  const clone = doc.documentElement.cloneNode(true);
  const root = clone.querySelector("#chem-app");
  if (root) root.innerHTML = "";
  let seed = clone.querySelector("#shemberg-seed");
  if (!seed) {
    seed = doc.createElement("script");
    seed.id = "shemberg-seed";
    seed.type = "application/json";
    clone.querySelector("body").prepend(seed);
  }
  seed.textContent = JSON.stringify({
    ...state,
    exportedAt: new Date().toISOString(),
  }).replace(/</g, "\\u003c");
  return "<!doctype html>\n" + clone.outerHTML;
}
