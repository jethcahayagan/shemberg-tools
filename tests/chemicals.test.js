import { test } from "node:test";
import assert from "node:assert/strict";
import {
  emptyState,
  saveChemical,
  chemicalRegistry,
  setDisposition,
  stockRows,
  upgradeState,
  register,
  transact,
  editBottle,
  alerts,
  fillLevel,
  validateBackup,
} from "../src/chemicals/core.js";
const raw = {
  section: "raw",
  bottleId: "RAW-01",
  name: "Acetic acid",
  unit: "mL",
  density: 1.05,
  minimum: 100,
  capacity: 1000,
  analyst: "JT",
  received: "2026-01-01",
  expiry: "2027-01-01",
};
const setup = () =>
  register(emptyState(), raw, { method: "gross", amount: 1250, tare: 200 });
test("net mass converts using verified density; withdrawal is atomic and preserves history", () => {
  const s = setup(),
    key = s.bottles[0].id;
  assert.equal(s.bottles[0].balance, 1000);
  const next = transact(s, key, {
    type: "Withdrawal",
    amount: 105,
    unit: "g",
    analyst: "JT",
    reason: "QA assay",
  });
  assert.equal(next.bottles[0].balance, 900);
  assert.equal(s.bottles[0].balance, 1000);
  assert.equal(next.events.length, 2);
  assert.equal(next.events[1].before, 1000);
  assert.equal(next.events[1].after, 900);
  assert.throws(
    () =>
      transact(s, key, {
        type: "Withdrawal",
        amount: 1001,
        unit: "mL",
        analyst: "JT",
        reason: "assay",
      }),
    /exceeds/,
  );
  assert.throws(
    () =>
      transact(s, key, {
        type: "Withdrawal",
        amount: 10,
        unit: "mL",
        analyst: "JT",
        reason: "",
      }),
    /required/,
  );
});
test("unknown tare records gross only, never invents net stock; recount establishes balance", () => {
  const s = register(
    emptyState(),
    { ...raw, density: null },
    { method: "gross", amount: 500, tare: "" },
  );
  const b = s.bottles[0];
  assert.equal(b.balance, null);
  assert.equal(b.gross, 500);
  assert.ok(alerts(b).includes("Gross weight tracked; net unknown"));
  assert.throws(
    () =>
      transact(s, b.id, {
        type: "Withdrawal",
        amount: 1,
        unit: "mL",
        analyst: "JT",
        reason: "test",
      }),
    /net inventory/,
  );
  assert.throws(
    () =>
      transact(s, b.id, {
        type: "Physical inventory",
        method: "mass",
        amount: 300,
        tare: "",
        analyst: "JT",
        reason: "weighed",
      }),
    /Density/,
  );
  const next = transact(s, b.id, {
    type: "Physical inventory",
    method: "volume",
    amount: 300,
    tare: "",
    analyst: "JT",
    reason: "measured volume",
  });
  assert.equal(next.bottles[0].balance, 300);
});
test("visual and height observations do not change quantitative stock", () => {
  const s = setup(),
    b = s.bottles[0];
  const next = transact(s, b.id, {
    type: "Visual observation",
    visual: "Half / mid",
    height: 5,
    heightUnit: "cm",
    analyst: "JT",
    reason: "Daily check",
  });
  assert.equal(next.bottles[0].balance, 1000);
  assert.equal(next.bottles[0].observation.height, 5);
  assert.equal(fillLevel(next.bottles[0]).percent, 100);
});
test("standardization retains previous concentration and analyst; alerts are date based", () => {
  const s = register(
    emptyState(),
    {
      ...raw,
      section: "standard",
      bottleId: "STD-01",
      concentration: "0.1 N",
      standardDate: "2026-01-01",
      restandardDate: "2026-02-01",
    },
    { method: "volume", amount: 500 },
  );
  const b = s.bottles[0];
  assert.ok(alerts(b, "2026-02-01").includes("Restandardization due"));
  const next = transact(s, b.id, {
    type: "Restandardization",
    concentration: "0.1002 N",
    standardDate: "2026-02-01",
    restandardDate: "2026-03-01",
    analyst: "QA2",
    reason: "Titration ref 25",
  });
  assert.equal(next.bottles[0].balance, 500);
  assert.equal(next.events[1].previousStandard.concentration, "0.1 N");
  assert.equal(next.bottles[0].analyst, "QA2");
});
test("backup validates state, metadata corrections preserve balance and unique IDs", () => {
  const s = setup(),
    b = s.bottles[0];
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(s))), s);
  assert.throws(
    () => register(s, raw, { method: "volume", amount: 200 }),
    /unique/,
  );
  const edited = editBottle(s, b.id, {
    supplier: "Supplier A",
    analyst: "JT",
    reason: "Label checked",
    balance: 1,
    unit: "g",
  });
  assert.equal(edited.bottles[0].balance, 1000);
  assert.equal(edited.bottles[0].unit, "mL");
  assert.equal(edited.events[1].previous.supplier, undefined);
  assert.throws(
    () => validateBackup({ ...s, bottles: [{ ...b, balance: -1 }] }),
    /balance/,
  );
  assert.throws(
    () =>
      register(
        emptyState(),
        { ...raw, expiry: "2025-01-01" },
        { method: "volume", amount: 200 },
      ),
    /Expiration/,
  );
});

test("height-only observations retain inches without changing stock; empty bottles alert", () => {
  const s = setup(),
    b = s.bottles[0];
  const n = transact(s, b.id, {
    type: "Visual observation",
    height: "2.5",
    heightUnit: "in",
    analyst: "JT",
    reason: "Bottle level check",
  });
  assert.equal(n.bottles[0].balance, 1000);
  assert.equal(n.bottles[0].observation.height, 2.5);
  assert.equal(n.bottles[0].observation.visual, "Height only");
  assert.equal(n.events[1].observation.heightUnit, "in");
  assert.ok(alerts({ ...b, balance: 0, minimum: null }).includes("Empty"));
});

test("default locator stocks keep separate rows and never overwrite saved quantities", () => {
  const catalog = [
    { id: "loc-a", name: "Salt", storage: "A" },
    { id: "loc-b", name: "Salt", storage: "B" },
  ];
  const defaults = stockRows(catalog, []);
  assert.equal(defaults.length, 2);
  assert.equal(defaults[0].balance, null);
  assert.equal(defaults[0].isCatalog, true);
  const s = register(
    emptyState(),
    { ...raw, catalogId: "loc-a" },
    { method: "volume", amount: 250 },
  );
  const rows = stockRows(catalog, s.bottles);
  assert.equal(rows.length, 2);
  assert.equal(rows.find((x) => x.catalogId === "loc-a").balance, 250);
  assert.equal(rows.find((x) => x.id === "loc-b").balance, null);
  assert.equal(s.bottles.length, 1);
});

test("legacy upgrade preserves quantities, keys and every historical event; marker determines group", () => {
  const original = setup();
  const b = original.bottles[0];
  delete b.stockGroup;
  delete b.internalCode;
  b.bottleId = "OLD STOCK RAW-001";
  const unchanged = structuredClone(original),
    next = upgradeState(original, []);
  assert.equal(next.bottles[0].stockGroup, "old");
  assert.equal(next.bottles[0].bottleId, b.bottleId);
  assert.equal(next.bottles[0].id, b.id);
  assert.equal(next.bottles[0].balance, b.balance);
  assert.deepEqual(next.events, original.events);
  assert.deepEqual(original, unchanged);
  assert.deepEqual(upgradeState(next, []), next);
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(next))), next);
});
test("before/after gross withdrawals support unknown net balance and preserve real readings", () => {
  const s = register(
    emptyState(),
    { ...raw, density: null },
    { method: "gross", amount: 800, tare: "" },
  );
  const key = s.bottles[0].id;
  const next = transact(s, key, {
    type: "Withdrawal",
    withdrawalMode: "gross",
    weightBefore: 800,
    weightAfter: 775,
    sameContainer: true,
    analyst: "JT",
    reason: "QA testing",
  });
  assert.equal(next.bottles[0].balance, null);
  assert.equal(next.bottles[0].gross, 775);
  assert.equal(next.events[1].quantity, 25);
  assert.equal(next.events[1].quantityUnit, "g");
  assert.equal(next.events[1].measurement.before, 800);
  assert.equal(next.events[1].after, null);
  assert.equal(s.bottles[0].gross, 800);
  assert.throws(
    () =>
      transact(s, key, {
        type: "Withdrawal",
        withdrawalMode: "gross",
        weightBefore: 800,
        weightAfter: 900,
        sameContainer: true,
        analyst: "JT",
        reason: "Test",
      }),
    /less than/,
  );
  assert.throws(
    () =>
      transact(s, key, {
        type: "Withdrawal",
        withdrawalMode: "gross",
        weightBefore: 800,
        weightAfter: 775,
        analyst: "JT",
        reason: "Test",
      }),
    /same bottle/,
  );
});
test("gross withdrawal also deducts known net stock using liquid density", () => {
  const s = setup(),
    key = s.bottles[0].id;
  const n = transact(s, key, {
    type: "Withdrawal",
    withdrawalMode: "gross",
    weightBefore: 1250,
    weightAfter: 1145,
    sameContainer: true,
    analyst: "JT",
    reason: "Analysis",
  });
  assert.equal(n.bottles[0].balance, 900);
  assert.equal(n.events[1].quantity, 105);
  assert.equal(n.events[1].stockChange, 100);
});
test("tracing metadata validates formula weight, temperature, opening pair; solid conversion prohibited", () => {
  const solid = register(
    emptyState(),
    {
      ...raw,
      phase: "Solid",
      unit: "g",
      formulaWeight: 40,
      densityTemp: 20,
      labCode: "QA-14",
      opened: "2026-01-02",
      openedBy: "JT",
    },
    { method: "mass", amount: 250 },
  );
  assert.equal(solid.bottles[0].formulaWeight, 40);
  assert.equal(solid.bottles[0].labCode, "QA-14");
  assert.throws(
    () =>
      transact(solid, solid.bottles[0].id, {
        type: "Withdrawal",
        amount: 10,
        unit: "mL",
        analyst: "JT",
        reason: "Test",
      }),
    /Solid stock/,
  );
  assert.throws(
    () =>
      register(
        emptyState(),
        { ...raw, formulaWeight: -1 },
        { method: "volume", amount: 100 },
      ),
    /Formula weight/,
  );
  assert.throws(
    () =>
      register(
        emptyState(),
        { ...raw, opened: "2026-01-02" },
        { method: "volume", amount: 100 },
      ),
    /both date/,
  );
});

test("chemical registry additions and edits survive backups and preserve bottle measurements and history", () => {
  const base = [
    {
      id: "loc-1",
      name: "Acetic acid",
      formula: "C2H4O2",
      cas: "64-19-7",
      classification: "organic acid",
      storage: "AR",
    },
  ];
  const start = register(
    emptyState(),
    { ...raw, catalogId: "loc-1", lot: "LOT-1", storage: "Bottle shelf" },
    { method: "volume", amount: 500 },
  );
  const firstEvent = structuredClone(start.events[0]);
  const next = saveChemical(
    start,
    base,
    {
      ...base[0],
      name: "Acetic acid, verified",
      formulaWeight: 60.05,
      stockGroup: "active",
      analyst: "JT",
      reason: "Label correction",
    },
    "loc-1",
  );
  assert.equal(next.bottles[0].name, "Acetic acid, verified");
  assert.equal(next.bottles[0].balance, 500);
  assert.equal(next.bottles[0].storage, "Bottle shelf");
  assert.equal(next.bottles[0].lot, "LOT-1");
  assert.deepEqual(next.events[0], firstEvent);
  assert.equal(next.events[1].type, "Chemical registry updated");
  assert.equal(next.registryEvents[0].previous.name, "Acetic acid");
  const added = saveChemical(next, base, {
    name: "New salt",
    formula: "NaCl",
    classification: "inorganic salt",
    stockGroup: "active",
    analyst: "JT",
    reason: "New reagent",
  });
  assert.equal(chemicalRegistry(base, added).length, 2);
  assert.equal(
    stockRows(chemicalRegistry(base, added), added.bottles).length,
    2,
  );
  assert.deepEqual(validateBackup(JSON.parse(JSON.stringify(added))), added);
  assert.equal(start.bottles[0].name, "Acetic acid");
});
test("disposal suggestion retains quantity, disposal archives with pre-disposal quantities and immutable history", () => {
  const s = setup(),
    b = s.bottles[0];
  const suggested = setDisposition(s, b.id, {
    status: "suggested",
    analyst: "JT",
    reason: "Expired reagent",
  });
  assert.equal(suggested.bottles[0].balance, b.balance);
  assert.equal(suggested.bottles[0].disposalStatus, "suggested");
  assert.throws(
    () =>
      setDisposition(suggested, b.id, {
        status: "archived",
        analyst: "JT",
        reason: "Disposed",
      }),
    /Confirm/,
  );
  const archived = setDisposition(suggested, b.id, {
    status: "archived",
    confirm: true,
    analyst: "JT",
    reason: "Collected for disposal",
    reference: "DISP-77",
  });
  assert.equal(archived.bottles[0].balance, 0);
  assert.equal(archived.bottles[0].disposal.previousBalance, 1000);
  assert.equal(archived.bottles[0].disposal.previousGross, 1250);
  assert.equal(archived.events[2].before, 1000);
  assert.equal(archived.events[2].after, 0);
  assert.deepEqual(archived.events[0], s.events[0]);
  assert.equal(archived.bottles[0].disposal.reference, "DISP-77");
  assert.deepEqual(
    validateBackup(JSON.parse(JSON.stringify(archived))),
    archived,
  );
  assert.throws(
    () =>
      transact(archived, b.id, {
        type: "Withdrawal",
        amount: 1,
        unit: "mL",
        analyst: "JT",
        reason: "Test",
      }),
    /archived/,
  );
  assert.throws(
    () =>
      editBottle(archived, b.id, {
        name: "Changed",
        analyst: "JT",
        reason: "Test",
      }),
    /archived/,
  );
});
test("unmeasured disposal record does not invent stock or recreate a disposed locator row", () => {
  const base = [{ id: "loc-1", name: "Unknown chemical" }];
  const s = register(
    emptyState(),
    { ...raw, catalogId: "loc-1" },
    { method: "unmeasured" },
  );
  const b = s.bottles[0];
  assert.equal(b.balance, null);
  assert.equal(b.gross, null);
  const next = setDisposition(s, b.id, {
    status: "archived",
    confirm: true,
    analyst: "JT",
    reason: "Container disposed",
  });
  assert.equal(next.bottles[0].balance, null);
  assert.equal(stockRows(base, next.bottles).length, 1);
  assert.equal(stockRows(base, next.bottles)[0].disposalStatus, "archived");
});

test("pre-registry custom chemicals appear in registry without duplicate stock rows or changed history", () => {
  const original = setup(),
    key = original.bottles[0].id;
  const catalog = chemicalRegistry([], original);
  assert.equal(catalog.length, 1);
  assert.equal(stockRows(catalog, original.bottles).length, 1);
  assert.equal(catalog[0].legacyBottleKey, key);
  const next = saveChemical(
    original,
    [],
    {
      ...catalog[0],
      name: "Acetic acid updated",
      analyst: "JT",
      reason: "Confirm name",
    },
    catalog[0].id,
  );
  assert.equal(next.bottles[0].name, "Acetic acid updated");
  assert.equal(next.bottles[0].balance, 1000);
  assert.equal(next.bottles[0].id, key);
  assert.deepEqual(next.events[0], original.events[0]);
});
