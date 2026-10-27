import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  ImageRun,
} from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { summarize, parseCSV, importRows, sortOriginals } from "./core.js";
export const columns = ["Date", "Samples", "Quantity", "Remarks"];
export function reportModel(records, logo, now = new Date()) {
  return {
    ...summarize(records),
    records: sortOriginals(records),
    logo,
    generatedAt: now.toISOString(),
    inventoryDates: [...new Set(records.map((r) => r.date))].sort(),
    sessions: [
      ...new Set(records.map((r) => r.sessionAt).filter(Boolean)),
    ].sort(),
  };
}
export function rowValues(r, includeInventoryDate = false) {
  const remarks =
    r.sources.length > 1
      ? r.remarkBreakdown
          .map((d) => `${d.quantity} units — ${d.remarks || "No remarks"}`)
          .join("\n") + `\n(${r.sources.length} original entries)`
      : r.remarks.join("\n");
  return [
    r.sampleDate || "NOT RECORDED",
    r.code,
    r.quantity,
    [
      r.type ? `Type: ${r.type}` : "",
      includeInventoryDate ? `Inventory: ${r.date}` : "",
      remarks,
    ]
      .filter(Boolean)
      .join("\n"),
  ];
}
const originalHeaders = [
  "Date of Inventory",
  "Date",
  "Samples",
  "Quantity",
  "Box Number",
  "Remarks",
  "Description (optional)",
  "Entry Timestamp",
  "Record ID",
  "Bundle ID",
  "Sample Type",
  "Legacy Bundle Status",
  "Original Bundle ID",
  "Batch ID",
  "Import Batch",
];
const originalValues = (r) => [
  r.date,
  r.sampleDate || "",
  r.code,
  r.quantity,
  r.box,
  r.remarks,
  r.description,
  r.sessionAt || "",
  r.id || "",
  r.bundle || "",
  r.type || "",
  r.bundleStatus || "",
  r.originalBundle || "",
  r.batchId || "",
  r.batchName || "",
];
const originalPrintValues = (r) => [
  r.sampleDate || "NOT RECORDED",
  r.code,
  r.quantity,
  r.remarks,
];
export function originalSections(m) {
  const groups = new Map();
  for (const r of m.records) {
    const key = JSON.stringify([r.box, r.date]);
    if (!groups.has(key))
      groups.set(key, { box: r.box, date: r.date, records: [] });
    groups.get(key).records.push(r);
  }
  return [...groups.values()];
}
export function saveBlob(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function imageBytes(data) {
  return Uint8Array.from(atob(data.split(",")[1]), (c) => c.charCodeAt(0));
}
export async function excelReport(m) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Shemberg Inventory";
  wb.created = new Date(m.generatedAt);
  const ws = wb.addWorksheet("Box Inventory");
  ws.columns = [{ width: 18 }, { width: 32 }, { width: 14 }, { width: 85 }];
  ws.pageSetup = {
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
  };
  if (m.logo) {
    const id = wb.addImage({ base64: m.logo, extension: "png" });
    ws.addImage(id, {
      tl: { col: 0, row: 0 },
      ext: { width: 150, height: 60 },
    });
    ws.addRow([]);
    ws.getRow(1).height = 48;
  }
  ws.addRow(["SHEMBERG — TOOTHPASTE INVENTORY"]);
  ws.addRow(["Report generated", m.generatedAt]);
  ws.addRow([
    "Assigned boxes",
    m.boxCount,
    "Unique products",
    m.products.length,
  ]);
  ws.addRow(["Total units", m.quantity, "Original records", m.originalCount]);
  ws.addRow(["Consolidated records", m.consolidatedCount]);
  ws.addRow(["Dates of Inventory", m.inventoryDates.join(", ")]);
  ws.addRow(["Entry timestamps (not report generation)"]);
  for (const s of m.sessions) ws.addRow([s]);
  for (const b of m.boxes) {
    ws.addRow([]);
    const h = ws.addRow([b.key ? `BOX NO. ${b.label}` : "UNASSIGNED BOX"]);
    h.font = { bold: true, color: { argb: "FF087F72" }, size: 14 };
    ws.addRow([
      "Date of Inventory",
      [...new Set(b.rows.map((r) => r.date))].sort().join(", "),
    ]);
    ws.addRow(columns).font = { bold: true };
    for (const r of b.rows)
      ws.addRow(rowValues(r, m.inventoryDates.length > 1));
    ws.addRow(["BOX TOTAL", "", b.total]).font = { bold: true };
  }
  ws.addRow(["GRAND TOTAL", "", m.quantity]).font = { bold: true };
  for (const row of ws._rows.filter(Boolean))
    row.alignment = { vertical: "top", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const products = wb.addWorksheet("Product Summary");
  products.addRow(["Samples", "Total quantity"]);
  m.products.forEach((p) => products.addRow([p.code, p.quantity]));
  products.addRow(["GRAND TOTAL", m.quantity]);
  products.columns = [{ width: 40 }, { width: 20 }];
  const originals = wb.addWorksheet("Original Records");
  originals.addRow(originalHeaders);
  m.records.forEach((r) => originals.addRow(originalValues(r)));
  originals.columns = [
    20, 18, 25, 14, 18, 55, 40, 30, 40, 22, 22, 20, 40, 30,
  ].map((width) => ({
    width,
  }));
  originals.columns.forEach((column, index) => {
    if (index >= 6) column.hidden = true;
  });
  return new Blob([await wb.xlsx.writeBuffer()], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
export async function readInventoryFile(file, defaults = {}) {
  if (file.size > 15 * 1024 * 1024) throw Error("Choose a file under 15 MB.");
  if (/\.csv$/i.test(file.name))
    return importRows(parseCSV(await file.text()), defaults);
  if (!/\.xlsx$/i.test(file.name))
    throw Error(
      "Choose a .csv or .xlsx file. Legacy .xls files must be saved as .xlsx first.",
    );
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.getWorksheet("Original Records") || wb.worksheets[0];
  if (!ws) throw Error("No worksheet found.");
  const rows = [];
  ws.eachRow((row) => {
    rows.push(
      row.values
        .slice(1)
        .map((v) =>
          v && typeof v === "object" && !(v instanceof Date)
            ? (v.text ??
              v.richText?.map((t) => t.text).join("") ??
              v.result ??
              "")
            : v,
        ),
    );
  });
  return importRows(rows, {
    ...defaults,
    allowUndated: ws.name === "Original Records",
  });
}
export async function wordReport(m) {
  const p = (text, heading) =>
    new Paragraph({ text: String(text), heading, spacing: { after: 160 } });
  const table = (headers, rows) =>
    new Table({
      width: { size: 100, type: "pct" },
      rows: [headers, ...rows].map(
        (r, i) =>
          new TableRow({
            tableHeader: i === 0,
            children: r.map(
              (v) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({ text: String(v), bold: i === 0 }),
                      ],
                    }),
                  ],
                }),
            ),
          }),
      ),
    });
  const children = [];
  if (m.logo)
    children.push(
      new Paragraph({
        children: [
          new ImageRun({
            type: "png",
            data: imageBytes(m.logo),
            transformation: { width: 150, height: 60 },
          }),
        ],
      }),
    );
  children.push(
    p("SHEMBERG | Toothpaste Inventory", HeadingLevel.TITLE),
    p(`Report generated: ${m.generatedAt}`),
    p(
      `${m.boxCount} assigned boxes · ${m.products.length} products · ${m.originalCount} original records · ${m.consolidatedCount} consolidated records`,
    ),
    p(`Dates of Inventory: ${m.inventoryDates.join(", ") || "No records"}`),
    p(`Entry timestamps: ${m.sessions.join(", ") || "Not recorded"}`),
  );
  for (const b of m.boxes)
    children.push(
      new Paragraph({
        text: b.key ? `BOX NO. ${b.label}` : "UNASSIGNED BOX",
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
      }),
      p(
        `Date of Inventory: ${[...new Set(b.rows.map((r) => r.date))].sort().join(", ")}`,
      ),
      table(
        columns,
        b.rows.map((r) => rowValues(r, m.inventoryDates.length > 1)),
      ),
      p(`BOX TOTAL: ${b.total} units`),
    );
  children.push(
    p(`GRAND TOTAL: ${m.quantity} units`, HeadingLevel.HEADING_1),
    p("Overall product summary", HeadingLevel.HEADING_1),
    table(
      ["Samples", "Total quantity"],
      m.products.map((p) => [p.code, p.quantity]),
    ),
    p("Original records", HeadingLevel.HEADING_1),
    ...originalSections(m).flatMap((group) => [
      p(
        `${group.box ? `BOX NO. ${group.box}` : "UNASSIGNED BOX"} · Date of Inventory: ${group.date}`,
        HeadingLevel.HEADING_2,
      ),
      table(columns, group.records.map(originalPrintValues)),
    ]),
    p(`GRAND TOTAL: ${m.quantity} units`, HeadingLevel.HEADING_1),
  );
  return Packer.toBlob(
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: { orientation: "portrait", width: 12240, height: 15840 },
            },
          },
          children,
        },
      ],
    }),
  );
}
export function pdfReport(m) {
  const pdf = new jsPDF({ orientation: "portrait" });
  let y = 18;
  const line = (text, size = 10) => {
    if (y > 275) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 180);
    pdf.text(lines, 14, y);
    y += lines.length * (size * 0.45) + 4;
  };
  if (m.logo) {
    pdf.addImage(m.logo, "PNG", 14, y, 40, 16);
    y += 22;
  }
  line("SHEMBERG | Toothpaste Inventory", 20);
  line(`Report generated: ${m.generatedAt}`);
  line(
    `${m.boxCount} assigned boxes | ${m.products.length} products | ${m.originalCount} original records | ${m.consolidatedCount} consolidated records`,
  );
  line(`Dates of Inventory: ${m.inventoryDates.join(", ") || "No records"}`);
  line("Entry timestamps:");
  for (const s of m.sessions) line(s);
  const table = (head, body) => {
    autoTable(pdf, {
      startY: y,
      head: [head],
      body,
      margin: { top: 16, bottom: 18 },
      styles: { fontSize: 8, overflow: "linebreak" },
      headStyles: { fillColor: [8, 127, 114] },
      rowPageBreak: "avoid",
    });
    y = pdf.lastAutoTable.finalY + 8;
  };
  for (const b of m.boxes) {
    if (y > 245) {
      pdf.addPage();
      y = 18;
    }
    line(b.key ? `BOX NO. ${b.label}` : "UNASSIGNED BOX", 14);
    line(
      `Date of Inventory: ${[...new Set(b.rows.map((r) => r.date))].sort().join(", ")}`,
    );
    table(
      columns,
      b.rows.map((r) => rowValues(r, m.inventoryDates.length > 1)),
    );
    line(`BOX TOTAL: ${b.total} units`, 12);
  }
  line(`GRAND TOTAL: ${m.quantity} units`, 15);
  line("Overall product summary", 14);
  table(
    ["Samples", "Total quantity"],
    m.products.map((p) => [p.code, p.quantity]),
  );
  line("Original records", 14);
  for (const group of originalSections(m)) {
    if (y > 245) {
      pdf.addPage();
      y = 18;
    }
    line(
      `${group.box ? `BOX NO. ${group.box}` : "UNASSIGNED BOX"} | Date of Inventory: ${group.date}`,
      12,
    );
    table(columns, group.records.map(originalPrintValues));
  }
  line(`GRAND TOTAL: ${m.quantity} units`, 15);
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.text(`Shemberg inventory | Page ${i} of ${pages}`, 14, 285);
  }
  return pdf.output("blob");
}
