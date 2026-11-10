import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { Readable } from "node:stream";
import { readableTables } from "../src/chemicals/readable-reports.js";
import {
  reportBands,
  reportContext,
  contextText,
  fullDetailTable,
  fullDetailCsv,
} from "../src/chemicals/report-data.js";
const bottle = {
  id: "b1",
  catalogId: "c1",
  name: "Test reagent",
  bottleId: "RAW-001",
  balance: 123.12345678901234,
  unit: "g",
  gross: 321.1234567890123,
  tare: null,
  supplier: "=Original supplier",
  notes: 'Line 1\nLine 2, "quoted"',
  densityTemp: -10,
  legacyBottleIds: ["1/2", "old label"],
  extra: { nested: null, empty: "", flag: false },
};
const event = {
  id: "e1",
  bottleKey: "b1",
  at: "2026-11-10T09:10:11.987Z",
  type: "Withdrawal",
  name: "Test reagent",
  bottleId: "RAW-001",
  before: 124.12345678901234,
  after: 123.12345678901234,
  quantity: 1,
  unit: "g",
  analyst: "Analyst",
  reason: "Test",
  snapshot: { ...bottle },
};
test("reading reports preserve decimal precision, tiny nonzero values and timestamp milliseconds", () => {
  const tables = readableTables([bottle], [event], {
    fields: ["name", "quantity", "gross"],
    log: true,
  });
  assert.ok(tables[0].rows[0].includes("123.12345678901234 g"));
  assert.ok(tables[0].rows[0].includes("321.1234567890123 g"));
  assert.match(tables[1].rows[0][0], /11\.987 UTC/);
  assert.ok(tables[1].rows[0].includes("124.12345678901234 g"));
  assert.equal(
    readableTables([{ ...bottle, balance: 1e-25 }], [], {
      fields: ["quantity"],
    })[0].rows[0][0],
    "1e-25 g",
  );
});
test("wide print tables repeat identities and retain every selected cell without tiny fonts", () => {
  const table = {
    name: "Inventory",
    headers: [
      "Chemical / solution",
      "Bottle ID",
      ...Array.from({ length: 17 }, (_, i) => "Field " + i),
    ],
    rows: [
      ["Reagent", "B1", ...Array.from({ length: 17 }, (_, i) => "Value " + i)],
    ],
  };
  const copy = structuredClone(table),
    bands = reportBands(table);
  assert.equal(bands.length, 5);
  for (const band of bands) {
    assert.ok(band.headers.length <= 6);
    assert.equal(band.rows[0][0], "Reagent");
    assert.equal(band.rows[0][1], "B1");
  }
  for (let i = 0; i < table.headers.length; i++)
    assert.ok(
      bands.some(
        (b) =>
          b.headers.includes(table.headers[i]) &&
          b.rows[0][b.headers.indexOf(table.headers[i])] === table.rows[0][i],
      ),
    );
  assert.deepEqual(table, copy);
});
test("full detail CSV round-trips exact values, nulls, arrays, nested snapshots, newlines and original formula-like text", async () => {
  const original = structuredClone(bottle),
    options = {
      log: true,
      filters: { storage: "Cab A", search: "Test" },
      originalBottles: [bottle],
      registry: [{ id: "c1", name: "Test reagent" }],
      registryEvents: [
        { id: "r1", chemicalId: "c1", snapshot: { name: "Original" } },
      ],
    };
  const context = reportContext(options, 1, "2026-11-10T11:12:13.456Z"),
    table = fullDetailTable([bottle], [event], options, context);
  const wb = new ExcelJS.Workbook();
  const sheet = await wb.csv.read(Readable.from([fullDetailCsv(table)]), {
    map: (value) => value,
  });
  const headers = sheet.getRow(1).values.slice(1),
    row = sheet.getRow(2).values.slice(1),
    restored = {};
  headers.forEach((key, i) => {
    if (key.startsWith("Data.") && row[i] !== "" && row[i] !== undefined)
      restored[key.slice(5)] = JSON.parse(row[i]);
  });
  assert.deepEqual(restored, bottle);
  assert.deepEqual(bottle, original);
  assert.equal(table.rows.length, 4);
  assert.equal(
    table.rows[0][table.headers.indexOf("Exported_at_UTC")],
    context.exportedAt,
  );
  assert.match(contextText(context), /storage: Cab A/);
  assert.match(contextText(context), /App 2026/);
  const activity = table.rows.find((row) => row[0] === "Activity");
  assert.deepEqual(
    JSON.parse(activity[table.headers.indexOf("Data.snapshot")]),
    event.snapshot,
  );
  const logOnly = fullDetailTable([bottle], [event], {
    inventory: false,
    log: true,
  });
  assert.deepEqual(
    logOnly.rows.map((row) => row[0]),
    ["Activity"],
  );
});
