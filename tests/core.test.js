import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  consolidate,
  summarize,
  parseCSV,
  importRows,
  duplicateFlags,
} from "../src/core.js";
const r = (
  quantity,
  box = "001",
  date = "2026-10-26",
  code = "TP001",
  remarks = "",
) =>
  normalize({
    quantity,
    box,
    date,
    code,
    remarks,
    description: "Toothpaste A",
  });
test("consolidation isolates box, date and product; keeps all sources and remarks", () => {
  const data = [
    r(5, "001", undefined, undefined, "Bundle"),
    r(3, "001", undefined, undefined, "Broken"),
    r(2),
    r(4, "002"),
    r(8, "001", "2026-10-25"),
    r(1, "001", undefined, "TP002"),
  ];
  const s = summarize(data);
  assert.equal(s.quantity, 23);
  assert.equal(s.originalCount, 6);
  assert.equal(s.consolidatedCount, 4);
  assert.equal(s.boxCount, 2);
  assert.equal(s.products[0].quantity, 22);
  const row = s.boxes[0].rows[1];
  assert.equal(row.quantity, 10);
  assert.equal(row.sources.length, 3);
  assert.deepEqual(row.remarks, ["Bundle", "Broken"]);
  assert.equal(s.boxes[0].total, 19);
});
test("natural box sort, oldest date first, natural product order; unassigned last", () => {
  const boxes = consolidate([
    r(1, "10"),
    r(1, ""),
    r(1, "2", undefined, "TP10"),
    r(1, "2", undefined, "TP2"),
    r(1, "1"),
    r(1, "2", "2026-10-25"),
  ]);
  assert.deepEqual(
    boxes.map((b) => b.key),
    ["1", "2", "10", ""],
  );
  assert.deepEqual(
    boxes[1].rows.map((r) => [r.date, r.code]),
    [
      ["2026-10-25", "TP001"],
      ["2026-10-26", "TP2"],
      ["2026-10-26", "TP10"],
    ],
  );
});
test("numeric box aliases consolidate while original labels remain", () => {
  const s = summarize([r(2, "001"), r(3, "1")]);
  assert.equal(s.boxCount, 1);
  assert.equal(s.consolidatedCount, 1);
  assert.equal(s.quantity, 5);
  assert.equal(s.boxes[0].rows[0].sources[1].box, "1");
});
test("CSV handles multiline remarks, quotes and commas without losing source records", () => {
  const rows = parseCSV(
    'Inventory Date,Product Code,Product Description,Quantity,Box Number,Remarks\r\n2026-10-26,TP001,"Paste, mint",3,001,"Counted ""OK""\nSecond line"\r\n',
  );
  const data = importRows(rows);
  assert.equal(data[0].box, "001");
  assert.equal(data[0].remarks, 'Counted "OK"\nSecond line');
  assert.equal(data[0].description, "Paste, mint");
  assert.throws(() => parseCSV('a,b\n"open'), /Unclosed/);
});
test("invalid dates, quantities and missing columns rejected", () => {
  assert.throws(() => r(-1));
  assert.throws(() => r(""));
  assert.throws(() => r(1.2));
  assert.throws(() => r(2, "1", "2026-02-30"));
  assert.throws(() => importRows([["Quantity"], [1]]), /Missing column/);
});
test("duplicates detected against saved records and within import, never cross box", () => {
  assert.deepEqual(duplicateFlags([r(2)], [r(2), r(5), r(5), r(2, "2")]), [
    true,
    false,
    true,
    false,
  ]);
});
test("Excel serial dates and header aliases accepted", () => {
  const data = importRows([
    ["Date", "SKU", "Description", "Qty", "Box No", "Notes"],
    [46321, "TP001", "Mint", 4, "007", "OK"],
  ]);
  assert.equal(data[0].date, "2026-10-26");
  assert.equal(data[0].box, "007");
});
