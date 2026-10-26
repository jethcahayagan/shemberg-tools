import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  consolidate,
  summarize,
  parseCSV,
  importRows,
  duplicateFlags,
  sortOriginals,
} from "../src/core.js";
const r = (
  quantity,
  box = "1 (Brown)",
  sampleDate = "2025-06-01",
  code = "Sample-A",
  remarks = "",
  date = "2026-10-24",
) =>
  normalize({
    quantity,
    box,
    sampleDate,
    code,
    remarks,
    date,
    description: "",
  });
test("same box, sample date, inventory session date and sample consolidate with original quantities and all remarks", () => {
  const data = [
    r(5, undefined, undefined, undefined, "Bundle"),
    r(3, undefined, undefined, undefined, "Broken"),
    r(2),
    r(4, "2 (White)"),
    r(8, undefined, "2025-05-01"),
    r(1, undefined, undefined, "Sample-B"),
  ];
  const s = summarize(data);
  assert.equal(s.quantity, 23);
  assert.equal(s.originalCount, 6);
  assert.equal(s.consolidatedCount, 4);
  assert.equal(s.boxCount, 2);
  assert.equal(s.products[0].quantity, 22);
  const row = s.boxes[0].rows[1];
  assert.equal(row.quantity, 10);
  assert.deepEqual(
    row.sources.map((r) => r.quantity),
    [5, 3, 2],
  );
  assert.deepEqual(row.remarks, ["Bundle", "Broken"]);
  assert.equal(s.boxes[0].total, 19);
});
test("same sample on different dates never consolidates; inventory sessions also stay separate", () => {
  const s = summarize([
    r(2),
    r(3, undefined, "2025-06-02"),
    r(4, undefined, undefined, undefined, "", "2026-10-25"),
  ]);
  assert.equal(s.consolidatedCount, 3);
  assert.equal(s.quantity, 9);
  assert.deepEqual(
    s.boxes[0].rows.map((r) => r.sampleDate),
    ["2025-06-01", "2025-06-01", "2025-06-02"],
  );
});
test("natural box sort, then sample date and sample code; inventory session date is a tiebreaker", () => {
  const data = [
    r(1, "10"),
    r(1, ""),
    r(1, "2", undefined, "Sample-10"),
    r(1, "2", undefined, "Sample-2"),
    r(1, "1"),
    r(1, "2", "2025-05-01", undefined, "", "2026-10-30"),
  ];
  const boxes = consolidate(data);
  assert.deepEqual(
    boxes.map((b) => b.key),
    ["1", "2", "10", ""],
  );
  assert.deepEqual(
    boxes[1].rows.map((r) => [r.sampleDate, r.code]),
    [
      ["2025-05-01", "Sample-A"],
      ["2025-06-01", "Sample-2"],
      ["2025-06-01", "Sample-10"],
    ],
  );
  assert.deepEqual(
    sortOriginals(data).map((r) => r.box),
    ["1", "2", "2", "2", "10", ""],
  );
});
test("numeric aliases consolidate but different text box labels remain separate", () => {
  const s = summarize([
    r(2, "001"),
    r(3, "1"),
    r(4, "1 (Brown)"),
    r(5, "1 (White)"),
  ]);
  assert.equal(s.boxCount, 3);
  assert.equal(s.consolidatedCount, 3);
  assert.equal(s.boxes[0].rows[0].sources[0].box, "001");
  assert.equal(s.boxes[0].rows[0].sources[1].box, "1");
});
test("raw sheet CSV accepts Date, Samples, Quantity, Remarks plus separate box and inventory session date", () => {
  const rows = parseCSV(
    'Date,Samples,Quantity,Remarks\r\n2025-06-01,"Paste, mint",3,"Counted ""OK""\nSecond line"\r\n',
  );
  const [row] = importRows(rows, {
    inventoryDate: "2026-10-24",
    box: "1 (Brown)",
  });
  assert.equal(row.date, "2026-10-24");
  assert.equal(row.sampleDate, "2025-06-01");
  assert.equal(row.code, "Paste, mint");
  assert.equal(row.description, "");
  assert.equal(row.remarks, 'Counted "OK"\nSecond line');
  assert.throws(() => parseCSV('a,b\n"open'), /Unclosed/);
});
test("row metadata overrides defaults; blank box remains unassigned", () => {
  const rows = [
    [
      "Date of Inventory",
      "Date",
      "Samples",
      "Quantity",
      "Box Number",
      "Remarks",
    ],
    ["2026-10-23", "2025-06-01", "Sample-A", 4, "", "  Keep spacing  "],
  ];
  const [row] = importRows(rows, {
    inventoryDate: "2026-10-24",
    box: "2 (White)",
  });
  assert.equal(row.date, "2026-10-23");
  assert.equal(row.box, "");
  assert.equal(row.remarks, "  Keep spacing  ");
});
test("missing session date or sample date are rejected, not guessed", () => {
  assert.throws(
    () =>
      importRows([
        ["Date", "Samples", "Quantity"],
        ["2025-06-01", "A", 1],
      ]),
    /Date of Inventory/,
  );
  assert.throws(
    () =>
      importRows([
        ["Date of Inventory", "Samples", "Quantity"],
        ["2026-10-24", "A", 1],
      ]),
    /sampleDate/,
  );
  assert.throws(
    () =>
      importRows([
        ["Date of Inventory", "Date", "Samples", "Quantity"],
        ["2026-10-24", "", "A", 1],
      ]),
    /sample date/,
  );
});
test("legacy records without sample dates remain separate and retain missing dates", () => {
  const a = r(2),
    b = r(3);
  a.sampleDate = "";
  b.sampleDate = "";
  const s = summarize([a, b]);
  assert.equal(s.consolidatedCount, 2);
  assert.equal(s.boxes[0].rows[0].sampleDate, "");
});
test("invalid dates and quantities rejected; description is optional", () => {
  assert.throws(() => r(-1));
  assert.throws(() => r(""));
  assert.throws(() => r(1.2));
  assert.throws(() => r(2, "1", "2025-02-30"));
  assert.throws(() => r(2, "1", undefined, undefined, "", "2026-02-30"));
  assert.equal(r(0).quantity, 0);
});
test("duplicates detect exact sources while preserving different dates, remarks and boxes", () => {
  assert.deepEqual(
    duplicateFlags(
      [r(2)],
      [
        r(2),
        r(5),
        r(5),
        r(2, "2"),
        r(2, undefined, "2025-06-02"),
        r(2, undefined, undefined, undefined, "Different"),
      ],
    ),
    [true, false, true, false, false, false],
  );
});
test("Excel serial sample dates and session dates plus legacy aliases accepted", () => {
  const [row] = importRows([
    ["Inventory Date", "Sample Date", "SKU", "Qty", "Box No", "Notes"],
    [46321, 45748, "MiXeD sample", 4, "007", "OK"],
  ]);
  assert.equal(row.date, "2026-10-26");
  assert.equal(row.sampleDate, "2025-04-01");
  assert.equal(row.code, "MiXeD sample");
  assert.equal(row.box, "007");
});
