import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import {
  emptyState,
  register,
  removeBottle,
  transact,
  validateBackup,
  saveChemical,
  chemicalRegistry,
  alerts,
} from "../src/chemicals/core.js";
import {
  nextChemicalCode,
  codeBasis,
  shelfReview,
  chemicalOverview,
} from "../src/chemicals/operations.js";
import {
  previewRegistryImport,
  applyRegistryImport,
  readRegistryFile,
} from "../src/chemicals/registry-import.js";
import { readableTables } from "../src/chemicals/readable-reports.js";
const raw = {
  name: "Test acid",
  section: "raw",
  bottleId: "B-1",
  unit: "g",
  analyst: "JT",
  classification: "acid",
  cas: "64-19-7",
  formula: "C2H4O2",
  supplier: "Supplier",
  received: "2020-01-01",
};
const base = [
  {
    id: "loc-1",
    name: "Existing salt",
    sourceRow: 10,
    formula: "NaCl",
    storage: "A",
  },
];
const setup = () =>
  register(emptyState(), raw, { method: "mass", amount: 500 });
test("automatic codes scan runtime history and removed records without changing previous numbering", () => {
  const s = setup();
  s.bottles[0].internalCode = "LAB-0091";
  s.bottles[0].deleted = {
    at: "2026-01-01",
    analyst: "JT",
    reason: "Duplicate",
  };
  s.registryEvents = [{ snapshot: { internalCode: "LAB-0119" } }];
  const original = structuredClone(s);
  assert.deepEqual(codeBasis(s, base), { prefix: "LAB-", padding: 4 });
  assert.equal(nextChemicalCode(s, base, codeBasis(s, base)), "LAB-0120");
  assert.equal(nextChemicalCode(s, base), "CHEM-011");
  assert.deepEqual(s, original);
});
test("registry import previews exact duplicates, selected rows and runtime codes; commit is atomic", () => {
  const s = saveChemical(emptyState(), base, {
    name: "Existing second",
    internalCode: "CHEM-500",
    analyst: "JT",
    reason: "Earlier entry",
  });
  const rows = [
    ["Chemical name", "Formula", "Storage"],
    ["Existing salt", "NaCl", "A"],
    ["New acid", "HCl", "AR"],
    ["New base", "NaOH", "AR"],
  ];
  const before = structuredClone(s),
    preview = previewRegistryImport(rows, s, base, {
      prefix: "CHEM-",
      padding: 3,
    });
  assert.equal(preview[0].duplicate, true);
  assert.equal(preview[1].code, "CHEM-501");
  assert.equal(preview[2].code, "CHEM-502");
  const next = applyRegistryImport(preview, new Set([2]), s, base, {
    analyst: "QA2",
    reason: "Supplier delivery",
    basis: { prefix: "CHEM-", padding: 3 },
  });
  assert.equal(next.registry.at(-1).internalCode, "CHEM-502");
  assert.equal(next.registry.at(-1).name, "New base");
  assert.deepEqual(s, before);
  assert.deepEqual(next.registryEvents[0], s.registryEvents[0]);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(next))), next);
  assert.throws(
    () =>
      previewRegistryImport(
        [
          ["Chemical name", "Formula weight"],
          ["Bad", "-1"],
        ],
        s,
        base,
      ),
    /positive/,
  );
  const changed = saveChemical(s, base, {
    name: "Another",
    internalCode: "CHEM-501",
    analyst: "JT",
    reason: "Another delivery",
  });
  assert.throws(
    () =>
      applyRegistryImport(preview, new Set([1]), changed, base, {
        analyst: "JT",
        reason: "Import",
        basis: { prefix: "CHEM-", padding: 3 },
      }),
    /numbering changed/,
  );
});
test("CSV and Excel registry imports read text and numbers from the first sheet", async () => {
  const csv = await readRegistryFile({
    name: "list.csv",
    size: 50,
    text: async () => 'Chemical name,Formula weight\r\n"New acid",60.05',
  });
  assert.equal(csv[1][0], "New acid");
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("Chemicals").addRows([
    ["Chemical name", "Formula weight"],
    ["New base", 40],
  ]);
  const buf = await wb.xlsx.writeBuffer();
  const rows = await readRegistryFile({
    name: "list.xlsx",
    size: buf.length,
    arrayBuffer: async () => buf,
  });
  assert.equal(rows[1][1], "40");
  assert.equal(
    previewRegistryImport(rows, emptyState(), base)[0].input.name,
    "New base",
  );
});
test("shelf review is a configurable review flag, not an expiration date", () => {
  const b = setup().bottles[0];
  const original = structuredClone(b);
  assert.equal(shelfReview(b, "2022-01-01").overdue, true);
  assert.equal(shelfReview(b).due, "2022-01-01");
  assert.ok(alerts(b, "2022-01-01").includes("Shelf-life review due"));
  assert.ok(!alerts(b, "2022-01-01").includes("Expired"));
  assert.equal(
    shelfReview({ ...b, expiry: "2028-01-01" }, "2026-01-01").due,
    "",
  );
  assert.equal(
    shelfReview({ ...b, shelfLifeMonths: 60 }, "2024-01-01").overdue,
    false,
  );
  assert.equal(shelfReview({ ...b, shelfLifeMonths: 0 }).due, "");
  assert.equal(
    shelfReview({ ...b, received: "", manufactured: "" }).missing,
    true,
  );
  assert.equal(
    shelfReview(
      { ...b, expiry: "2028-01-01", opened: "2026-01-31", openedLifeMonths: 1 },
      "2026-03-01",
    ).due,
    "2026-02-28",
  );
  assert.deepEqual(b, original);
});
test("overview traces multiple bottles without pooling different concentration or units or removed stock", () => {
  const b = setup().bottles[0],
    groups = chemicalOverview([
      b,
      {
        ...b,
        id: "b2",
        bottleId: "B-2",
        balance: 250,
        unit: "mL",
        storage: "AR",
      },
      { ...b, id: "b3", bottleId: "B-3", balance: null },
      { ...b, id: "b4", deleted: { reason: "Duplicate" } },
      { ...b, id: "b5", disposalStatus: "archived" },
      { ...b, id: "b6", concentration: "0.1 N" },
    ]);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].bottles, 3);
  assert.equal(groups[0].grams, 500);
  assert.equal(groups[0].milliliters, 250);
  assert.equal(groups[0].unknown, 1);
  assert.deepEqual(groups[0].ids, ["B-1", "B-2", "B-3"]);
});
test("mistaken bottle removal is reversible and preserves quantity, IDs, logs, backup and code reservations", () => {
  const s = setup(),
    key = s.bottles[0].id;
  const removed = removeBottle(s, key, {
    analyst: "JT",
    reason: "Duplicate input",
    confirm: true,
  });
  assert.equal(removed.bottles[0].balance, 500);
  assert.equal(removed.bottles[0].id, key);
  assert.deepEqual(removed.events[0], s.events[0]);
  assert.equal(chemicalOverview(removed.bottles).length, 0);
  assert.throws(
    () =>
      transact(removed, key, {
        type: "Withdrawal",
        amount: 1,
        unit: "g",
        analyst: "JT",
        reason: "Test",
      }),
    /restored/,
  );
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(removed))),
    removed,
  );
  const restored = removeBottle(
    removed,
    key,
    { analyst: "JT", reason: "Restore correct record" },
    true,
  );
  assert.equal(restored.bottles[0].deleted, undefined);
  assert.equal(restored.bottles[0].balance, 500);
  assert.equal(restored.events.at(-1).type, "Bottle restored");
});
test("readable reports contain only selected sections and columns, with no JSON snapshots", () => {
  const s = setup(),
    tables = readableTables(s.bottles, s.events, {
      fields: ["name", "quantity", "supplier"],
      inventory: true,
      overview: false,
      log: false,
    });
  assert.deepEqual(tables[0].headers, [
    "Chemical / solution",
    "Quantity",
    "Supplier",
  ]);
  assert.deepEqual(tables[0].rows[0], ["Test acid", "500 g", "Supplier"]);
  assert.equal(tables.length, 1);
  assert.ok(!JSON.stringify(tables).includes("snapshot"));
  assert.equal(
    readableTables(s.bottles, s.events, {
      inventory: false,
      overview: true,
      log: true,
    }).length,
    2,
  );
  assert.throws(
    () => readableTables(s.bottles, s.events, { fields: [] }),
    /column/,
  );
});

test("numeric-only running codes continue without an added prefix", () => {
  const s = setup();
  s.bottles[0].internalCode = "0099";
  const basis = codeBasis(s, []);
  assert.deepEqual(basis, { prefix: "", padding: 4 });
  assert.equal(nextChemicalCode(s, [], basis), "0100");
});
