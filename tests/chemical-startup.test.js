import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  emptyState,
  register,
  chemicalRegistry,
} from "../src/chemicals/core.js";
import {
  DATA_VERSION,
  initializeInventory,
  prepareInventory,
} from "../src/chemicals/startup.js";
const read = async (name) =>
  JSON.parse(
    await readFile(
      new URL("../src/chemicals/" + name, import.meta.url),
      "utf8",
    ),
  );
const base = await read("catalog.json");
const additions = [
  ...(await read("registry-baseline-extras.json")),
  ...(await read("inventory-supplement.json")),
];
const enrichment = await read("registry-enrichment.json");
const KEY = "shemberg-qa-chemicals-v1";
function storage(initial) {
  const data = new Map(
    initial === undefined ? [] : [[KEY, JSON.stringify(initial)]],
  );
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
    data,
  };
}
function backup() {
  return register(
    emptyState(),
    {
      section: "raw",
      catalogId: "locator-77",
      sourceRow: 77,
      name: "Thymolphthalein",
      formula: "C₂₈H₃₀O₄",
      cas: "125-20-2",
      bottleId: "1/2",
      internalCode: "OLS STOCK CHEM-077",
      unit: "g",
      stockGroup: "old",
      analyst: "Test analyst",
      supplier: "Test supplier",
      lot: "Lot A",
      labCode: "My exact code",
      received: "2026-01-01",
      opened: "2026-01-02",
      openedBy: "Test analyst",
    },
    { method: "mass", amount: 125 },
  );
}
test("embedded records open automatically with added registry definitions and original history", () => {
  const original = backup(),
    copy = structuredClone(original),
    s = storage();
  const result = initializeInventory(
    s,
    KEY,
    original,
    base,
    additions,
    enrichment,
  );
  assert.equal(result.source, "embedded");
  assert.equal(result.state.bottles.length, 1);
  assert.ok(chemicalRegistry(base, result.state).length > 136);
  assert.equal(result.state.bottles[0].balance, 125);
  assert.equal(result.state.bottles[0].supplier, "Test supplier");
  assert.equal(result.state.bottles[0].labCode, "My exact code");
  assert.deepEqual(
    result.state.events.slice(0, original.events.length),
    original.events,
  );
  assert.equal(result.state.appDataVersion, DATA_VERSION);
  assert.deepEqual(original, copy);
});
test("existing browser records take precedence over an older embedded backup and exact recovery is retained", () => {
  const seed = backup(),
    newer = structuredClone(seed);
  newer.bottles[0].balance = 110;
  newer.bottles[0].supplier = "New supplier";
  const s = storage(newer),
    raw = s.getItem(KEY);
  const result = initializeInventory(s, KEY, seed, base, additions, enrichment);
  assert.equal(result.source, "browser");
  assert.equal(result.state.bottles[0].balance, 110);
  assert.equal(result.state.bottles[0].supplier, "New supplier");
  assert.equal(s.getItem(KEY + "-before-" + DATA_VERSION), raw);
  const saved = s.getItem(KEY),
    second = initializeInventory(s, KEY, seed, base, additions, enrichment);
  assert.equal(second.updated, false);
  assert.equal(s.getItem(KEY), saved);
  assert.equal(second.state.events.length, result.state.events.length);
  assert.equal(
    second.state.registryEvents.length,
    result.state.registryEvents.length,
  );
});
test("an intentionally empty browser inventory is not replaced by embedded bottles", () => {
  const result = initializeInventory(
    storage(emptyState()),
    KEY,
    backup(),
    base,
    additions,
    enrichment,
  );
  assert.equal(result.source, "browser");
  assert.equal(result.state.bottles.length, 0);
});
test("corrupt browser records stop loading instead of overwriting them with the seed", () => {
  const s = storage();
  s.setItem(KEY, "{broken");
  assert.throws(() =>
    initializeInventory(s, KEY, backup(), base, additions, enrichment),
  );
  assert.equal(s.getItem(KEY), "{broken");
  assert.equal(s.data.size, 1);
});
test("storage failure during migration keeps the previous workspace unchanged", () => {
  for (const failAt of [1, 2]) {
    const s = storage(backup()),
      before = s.getItem(KEY),
      write = s.setItem;
    let writes = 0;
    s.setItem = (key, value) => {
      if (++writes === failAt) throw Error("Storage full");
      write(key, value);
    };
    assert.throws(
      () => initializeInventory(s, KEY, backup(), base, additions, enrichment),
      /Storage full/,
    );
    assert.equal(s.getItem(KEY), before);
  }
});
test("registry enrichment fills blank master fields and retains recorded metadata", () => {
  const original = backup();
  const patches = [
    {
      name: "Thymolphthalein",
      cas: "125-20-2",
      labCode: "G3",
      storage: "Do not replace",
      classification: "Do not replace",
    },
  ];
  const updated = prepareInventory(original, base, additions, patches);
  const master = chemicalRegistry(base, updated).find(
    (c) => c.id === "locator-77",
  );
  assert.equal(master.labCode, "G3");
  assert.notEqual(master.storage, "Do not replace");
  assert.notEqual(master.classification, "Do not replace");
  assert.equal(updated.bottles[0].labCode, "My exact code");
});

test("old stock inferred from legacy labels survives automatic renumbering", () => {
  const original = backup();
  delete original.bottles[0].stockGroup;
  original.bottles[0].bottleId = "OLD STOCK RAW-077";
  const updated = prepareInventory(original, base, additions, enrichment);
  assert.equal(updated.bottles[0].stockGroup, "old");
  assert.equal(updated.bottles[0].internalCode, "OLD STOCK CHEM-077");
  assert.deepEqual(
    updated.events.slice(0, original.events.length),
    original.events,
  );
});
