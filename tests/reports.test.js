import { test } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import {
  reportModel,
  excelReport,
  wordReport,
  pdfReport,
  readInventoryFile,
} from "../src/reports.js";
import { normalize, summarize } from "../src/core.js";
const records = [
  ["001", 5, "Bundle"],
  ["001", 3, "Broken"],
  ["002", 4, "Other"],
  ["", 2, "Loose"],
].map(([box, quantity, remarks], i) =>
  normalize({
    id: `record-${i}`,
    date: "2026-10-24",
    sampleDate: "2025-03-26",
    code: "LB-2210",
    description: "Toothpaste sample",
    box,
    quantity,
    remarks,
    sessionAt: "2026-10-26T04:30:00.000Z",
  }),
);
const logo =
  "data:image/png;base64," +
  (await readFile("src/assets/shemberg-logo.png")).toString("base64");
const model = reportModel(records, logo, new Date("2026-10-27T09:00:00Z"));
test("Excel is a valid workbook with box totals, product totals, logo and lossless source reimport", async () => {
  const blob = await excelReport(model),
    bytes = await blob.arrayBuffer();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes);
  assert.deepEqual(
    wb.worksheets.map((s) => s.name),
    ["Box Inventory", "Product Summary", "Original Records"],
  );
  assert.equal(wb.getWorksheet("Original Records").rowCount, 5);
  const values = [];
  wb.getWorksheet("Box Inventory").eachRow((r) => values.push(r.values));
  assert.equal(values.find((v) => v[1] === "GRAND TOTAL")[4], 14);
  assert.equal(
    wb.getWorksheet("Product Summary").getRow(2).getCell(3).value,
    14,
  );
  assert.equal(wb.getWorksheet("Box Inventory").getImages().length, 1);
  const file = new File([bytes], "inventory.xlsx");
  const imported = await readInventoryFile(file);
  assert.equal(imported.length, 4);
  assert.equal(summarize(imported).quantity, 14);
  assert.equal(summarize(imported).consolidatedCount, 3);
  assert.equal(imported[0].sampleDate, "2025-03-26");
  assert.equal(imported[0].box, "001");
  assert.equal(imported[0].sessionAt, records[0].sessionAt);
});
test("Word report is real OOXML with headings, source remarks and separate timestamps", async () => {
  const blob = await wordReport(model),
    zip = await JSZip.loadAsync(await blob.arrayBuffer()),
    xml = await zip.file("word/document.xml").async("string");
  for (const text of [
    "BOX NO. 001",
    "BOX NO. 002",
    "UNASSIGNED BOX",
    "GRAND TOTAL: 14 units",
    "Broken",
    "2025-03-26",
    "2026-10-27T09:00:00.000Z",
    "2026-10-26T04:30:00.000Z",
  ])
    assert.ok(xml.includes(text), text);
  assert.ok(
    Object.keys(zip.files).some(
      (s) => s.startsWith("word/media/") && !zip.files[s].dir,
    ),
  );
});
test("PDF is a real PDF with consistent box totals, logo, originals and product summary", async () => {
  const blob = pdfReport(model),
    buf = Buffer.from(await blob.arrayBuffer()),
    s = buf.toString("latin1");
  assert.equal(s.slice(0, 5), "%PDF-");
  for (const text of [
    "BOX NO. 001",
    "BOX NO. 002",
    "UNASSIGNED BOX",
    "GRAND TOTAL: 14 units",
    "Original records",
    "Broken",
  ])
    assert.ok(s.includes(text), text);
  assert.ok(s.includes("/Subtype /Image"));
});
