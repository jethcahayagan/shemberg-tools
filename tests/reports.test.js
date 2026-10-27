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
    bundle: "Group-A",
    type: "paste",
    bundleStatus: "bundled",
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
  assert.equal(wb.getWorksheet("Original Records").getColumn(7).hidden, true);
  let headerRow, firstData;
  wb.getWorksheet("Box Inventory").eachRow((row) => {
    if (!headerRow && row.getCell(1).value === "Date") {
      headerRow = row.number;
      firstData = wb.getWorksheet("Box Inventory").getRow(headerRow + 1);
    }
  });
  assert.deepEqual(
    wb.getWorksheet("Box Inventory").getRow(headerRow).values.slice(1),
    ["Date", "Samples", "Quantity", "Remarks"],
  );
  assert.equal(firstData.getCell(1).value, "2025-03-26");
  assert.equal(firstData.getCell(2).value, "LB-2210");
  assert.equal(firstData.getCell(3).value, 8);
  assert.equal(firstData.cellCount, 4);
  assert.ok(firstData.getCell(4).value.includes("5 units — Bundle"));
  assert.ok(firstData.getCell(4).value.includes("3 units — Broken"));
  assert.ok(firstData.getCell(4).value.includes("2 original entries"));
  const values = [];
  wb.getWorksheet("Box Inventory").eachRow((r) => values.push(r.values));
  assert.equal(values.find((v) => v[1] === "GRAND TOTAL")[3], 14);
  assert.equal(
    wb.getWorksheet("Product Summary").getRow(2).getCell(2).value,
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
  const firstHeader = xml.match(/<w:tr>[\s\S]*?<\/w:tr>/)?.[0];
  assert.equal((firstHeader.match(/<w:tc>/g) || []).length, 4);
  assert.ok(!xml.includes("Tracking / provenance"));
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

test("raw sheet Excel imports with separate sheet metadata; reports keep different sample dates and sessions separate", async () => {
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Encoded samples");
  sheet.addRow(["Date", "Samples", "Quantity", "Remarks"]);
  sheet.addRow(["2025-05-01", "Mixed-case sample", 2, "50/50 hot process"]);
  sheet.addRow(["2025-05-01", "Mixed-case sample", 3, "#2; 48°C"]);
  sheet.addRow(["2025-05-02", "Mixed-case sample", 4, "Different sample date"]);
  const file = new File([await wb.xlsx.writeBuffer()], "encoded.xlsx");
  const imported = await readInventoryFile(file, {
    inventoryDate: "2026-10-24",
    box: "3 (Blue)",
    bundle: "Group-A",
    type: "gel",
    bundleStatus: "bundled",
  });
  assert.equal(imported[0].code, "Mixed-case sample");
  assert.equal(imported[0].date, "2026-10-24");
  assert.equal(imported[0].sampleDate, "2025-05-01");
  const m = reportModel(
    [...imported, { ...imported[0], date: "2026-10-25", quantity: 6 }],
    logo,
  );
  assert.equal(m.quantity, 15);
  assert.equal(m.consolidatedCount, 3);
  const output = new ExcelJS.Workbook();
  await output.xlsx.load(await (await excelReport(m)).arrayBuffer());
  const rows = [];
  let started = false;
  output.getWorksheet("Box Inventory").eachRow((row) => {
    if (row.getCell(1).value === "Date") {
      started = true;
      return;
    }
    if (started && /^\d{4}-\d{2}-\d{2}$/.test(String(row.getCell(1).value)))
      rows.push(row.values.slice(1));
  });
  assert.deepEqual(
    rows.map((r) => r.slice(0, 3)),
    [
      ["2025-05-01", "Mixed-case sample", 5],
      ["2025-05-01", "Mixed-case sample", 6],
      ["2025-05-02", "Mixed-case sample", 4],
    ],
  );
  assert.ok(rows[0][3].includes("Inventory: 2026-10-24"));
  assert.ok(rows[1][3].includes("Inventory: 2026-10-25"));
  assert.ok(rows[0][3].includes("2 units — 50/50 hot process"));
  assert.ok(rows[0][3].includes("3 units — #2; 48°C"));
  const zip = await JSZip.loadAsync(await (await wordReport(m)).arrayBuffer());
  const xml = await zip.file("word/document.xml").async("string");
  for (const v of [
    "2025-05-01",
    "2025-05-02",
    "2026-10-24",
    "2026-10-25",
    "Mixed-case sample",
    "50/50 hot process",
    "#2; 48°C",
  ])
    assert.ok(xml.includes(v), v);
  const pdf = Buffer.from(await pdfReport(m).arrayBuffer()).toString("latin1");
  for (const v of [
    "2025-05-01",
    "2025-05-02",
    "Mixed-case sample",
    "GRAND TOTAL: 15 units",
  ])
    assert.ok(pdf.includes(v), v);
});

test("tracking metadata and remark quantities survive every report and Excel original reimport", async () => {
  const data = [
    normalize({
      ...records[0],
      bundle: "Batch-X",
      originalBundle: "Batch-X",
      type: "gel",
      bundleStatus: "loose",
      remarks: "Found apart",
      quantity: 2,
      batchId: "import-123",
      batchName: "Box 1 import",
    }),
    normalize({
      ...records[0],
      id: "second",
      bundle: "Batch-X",
      originalBundle: "Batch-X",
      type: "gel",
      bundleStatus: "loose",
      remarks: "Broken packet",
      quantity: 3,
      batchId: "import-123",
      batchName: "Box 1 import",
    }),
  ];
  const m = reportModel(data, logo);
  const blob = await excelReport(m);
  const file = new File([await blob.arrayBuffer()], "tracking.xlsx");
  const imported = await readInventoryFile(file);
  assert.equal(imported[0].bundle, "LB-2210 · 2025-03-26");
  assert.equal(imported[0].originalBundle, "Batch-X");
  assert.equal(imported[0].type, "gel");
  assert.equal(imported[0].bundleStatus, "loose");
  assert.equal(imported[0].batchId, "import-123");
  assert.equal(imported[0].batchName, "Box 1 import");
  assert.equal(summarize(imported).consolidatedCount, 1);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await blob.arrayBuffer());
  let values;
  wb.getWorksheet("Box Inventory").eachRow((row) => {
    if (row.getCell(2).value === "LB-2210") values = row.values.slice(1);
  });
  assert.equal(values.length, 4);
  assert.ok(values[3].includes("Type: gel"));
  assert.ok(values[3].includes("2 units — Found apart"));
  assert.ok(values[3].includes("3 units — Broken packet"));
  const zip = await JSZip.loadAsync(await (await wordReport(m)).arrayBuffer()),
    xml = await zip.file("word/document.xml").async("string");
  for (const text of [
    "gel",
    "Found apart",
    "Broken packet",
    "2 units",
    "3 units",
  ])
    assert.ok(xml.includes(text), text);
  const pdf = Buffer.from(await pdfReport(m).arrayBuffer()).toString("latin1");
  for (const text of ["gel", "Found apart", "Broken packet"])
    assert.ok(pdf.includes(text), text);
});
