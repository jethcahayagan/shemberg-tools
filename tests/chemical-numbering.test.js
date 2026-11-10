import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  register,
  validateBackup,
  chemicalRegistry,
  removeBottle,
} from "../src/chemicals/core.js";
import {
  repairRegistration,
  nextBottleDetails,
  bottleTemplate,
  changeChemicalGroup,
  updateInventoryBackup,
} from "../src/chemicals/numbering.js";
const base = [
  {
    id: "locator-41",
    sourceRow: 41,
    name: "Iron nitrate",
    cas: "7782-61-8",
    formula: "Fe(NO3)3",
    sourceGroup: "Old stock",
  },
  {
    id: "locator-77",
    sourceRow: 77,
    name: "Indicator",
    cas: "125-20-2",
    formula: "C28H30O4",
    sourceGroup: "Old stock",
  },
];
function seed() {
  let s = emptyState();
  for (const [i, label] of [
    [1, "1/2"],
    [2, "2/2"],
  ])
    s = register(
      s,
      {
        section: "raw",
        catalogId: "locator-77",
        sourceRow: 77,
        name: "Indicator",
        cas: "125-20-2",
        formula: "C28H30O4",
        stockGroup: "old",
        bottleId: label,
        internalCode: "OLS STOCK CHEM-077",
        unit: "g",
        analyst: "JT",
        supplier: "Example supplier",
        lot: "LOT-" + i,
        storage: "Cab A",
        opened: "2026-01-02",
        openedBy: "JT",
        received: "2026-01-01",
      },
      { method: "mass", amount: i * 100 },
    );
  return s;
}
test("registration repair normalizes old prefixes, completes fraction IDs, retains all records and is idempotent", () => {
  const s = seed(),
    old = structuredClone(s),
    n = repairRegistration(s, base);
  assert.deepEqual(
    n.bottles.map((b) => b.bottleId),
    ["1/2 RAW-077", "2/2 RAW-077"],
  );
  assert.deepEqual(
    n.bottles.map((b) => b.internalCode),
    ["OLD STOCK CHEM-077", "OLD STOCK CHEM-077"],
  );
  assert.deepEqual(n.events.slice(0, s.events.length), s.events);
  assert.deepEqual(
    n.bottles.map((b) => b.balance),
    [100, 200],
  );
  assert.ok(n.bottles[0].legacyBottleIds.includes("1/2"));
  assert.equal(n.bottles[0].containerCode, "RAW-077-B001");
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(n))), n);
  assert.deepEqual(repairRegistration(n, base), n);
  assert.deepEqual(s, old);
});
test("same-chemical bottle copy is editable, generates next fraction and leaves amount/opening/tare unfilled", () => {
  let s = repairRegistration(seed(), base);
  const c = chemicalRegistry(base, s).find((c) => c.id === "locator-77");
  const { draft, previous } = bottleTemplate(s, c, s.bottles[0].id);
  assert.equal(previous.id, s.bottles[0].id);
  assert.equal(draft.supplier, "Example supplier");
  assert.equal(draft.lot, "LOT-1");
  assert.equal(draft.opened, "");
  assert.equal(draft.openedBy, "");
  assert.equal(draft.tare, null);
  assert.equal(draft.balance, undefined);
  assert.equal(draft.bottleId, "3/3 RAW-077");
  assert.equal(draft.containerCode, "RAW-077-B003");
  s = register(
    s,
    {
      ...draft,
      catalogId: c.id,
      section: "raw",
      lot: "DIFFERENT-LOT",
      supplier: "Different supplier",
    },
    { method: "mass", amount: 50 },
    base,
  );
  assert.deepEqual(
    s.bottles.map((b) => b.bottleId),
    ["1/3 RAW-077", "2/3 RAW-077", "3/3 RAW-077"],
  );
  assert.equal(s.bottles[0].lot, "LOT-1");
  assert.equal(s.bottles[2].lot, "DIFFERENT-LOT");
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(s))), s);
  const removed = removeBottle(
    s,
    s.bottles[1].id,
    { confirm: true, analyst: "JT", reason: "Duplicate" },
    false,
    base,
  );
  assert.equal(removed.bottles[2].bottleId, "2/2 RAW-077");
  assert.equal(removed.bottles[2].containerCode, "RAW-077-B003");
  const restored = removeBottle(
    removed,
    s.bottles[1].id,
    { analyst: "JT", reason: "Restore" },
    true,
    base,
  );
  assert.deepEqual(
    restored.bottles.map((b) => b.bottleId),
    ["1/3 RAW-077", "2/3 RAW-077", "3/3 RAW-077"],
  );
});
test("chemical group button preserves numeric references, labels, balances and original logs", () => {
  const s = repairRegistration(seed(), base);
  const n = changeChemicalGroup(s, base, "locator-77", "active", {
    analyst: "JT",
    reason: "Reclassified after review",
  });
  assert.deepEqual(
    n.bottles.map((b) => b.internalCode),
    ["CHEM-077", "CHEM-077"],
  );
  assert.deepEqual(
    n.bottles.map((b) => b.bottleId),
    s.bottles.map((b) => b.bottleId),
  );
  assert.deepEqual(
    n.bottles.map((b) => b.balance),
    [100, 200],
  );
  assert.deepEqual(n.events.slice(0, s.events.length), s.events);
  assert.ok(n.bottles.every((b) => b.stockGroup === "active"));
  assert.equal(
    chemicalRegistry(base, n).find((c) => c.id === "locator-77").stockGroup,
    "active",
  );
});
test("wrong phosphate link is repaired by unique name and CAS, without replacing the bottle formula", () => {
  const b = [
    {
      id: "mono",
      sourceRow: 53,
      name: "Potassium dihydrogen orthophosphate",
      cas: "7778-77-0",
      formula: "KH₂PO₄",
    },
    {
      id: "di",
      internalCode: "OLD STOCK CHEM-153",
      name: "Dipotassium hydrogen orthophosphate",
      cas: "7758-11-4",
      formula: "K₂HPO₄",
      stockGroup: "old",
    },
  ];
  const s = register(
    emptyState(),
    {
      section: "raw",
      catalogId: "mono",
      sourceRow: 53,
      name: "Dipotassium hydrogen orthophosphate",
      cas: "7758-11-4",
      formula: "KH₂PO₄",
      stockGroup: "old",
      bottleId: "RAW-144",
      internalCode: "OLD STOCK CHEM-144",
      unit: "g",
      analyst: "JT",
    },
    { method: "gross", amount: 500, tare: "" },
  );
  const n = repairRegistration(s, b);
  assert.equal(n.bottles[0].catalogId, "di");
  assert.equal(n.bottles[0].sourceRow, null);
  assert.equal(n.bottles[0].bottleId, "RAW-153");
  assert.equal(n.bottles[0].formula, "KH₂PO₄");
  assert.match(n.bottles[0].numberingReview, /verify/);
  assert.equal(n.bottles[0].gross, 500);
});
test("supplement only adds missing registry metadata; repeated reconciliation changes nothing", () => {
  const s = seed(),
    entries = [
      {
        id: "new-definition",
        name: "New reagent",
        cas: "123-45-6",
        stockGroup: "active",
        classification: "salt",
      },
    ];
  const n = updateInventoryBackup(s, base, entries);
  assert.equal(n.bottles.length, 2);
  assert.deepEqual(n.events.slice(0, s.events.length), s.events);
  assert.equal(
    chemicalRegistry(base, n).find((c) => c.id === "new-definition")
      .internalCode,
    "CHEM-078",
  );
  assert.deepEqual(updateInventoryBackup(n, base, entries), n);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(n))), n);
});
