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
export const columns = [
  "Date",
  "Samples",
  "Quantity",
  "Source Entries",
  "Remarks",
  "Date of Inventory",
];
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
export const rowValues = (r) => [
  r.sampleDate || "NOT RECORDED",
  r.code,
  r.quantity,
  r.sources.length,
  r.remarks.join(" | "),
  r.date,
];
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
];
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
  ws.columns = [
    { width: 18 },
    { width: 20 },
    { width: 14 },
    { width: 16 },
    { width: 55 },
    { width: 20 },
  ];
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
  ws.addRow([
    "Total units",
    m.quantity,
    "Original records",
    m.originalCount,
    "Consolidated records",
    m.consolidatedCount,
  ]);
  ws.addRow(["Dates of Inventory", m.inventoryDates.join(", ")]);
  ws.addRow(["Entry timestamps (not report generation)"]);
  for (const s of m.sessions) ws.addRow([s]);
  for (const b of m.boxes) {
    ws.addRow([]);
    const h = ws.addRow([b.key ? `BOX NO. ${b.label}` : "UNASSIGNED BOX"]);
    h.font = { bold: true, color: { argb: "FF087F72" }, size: 14 };
    ws.addRow(columns).font = { bold: true };
    for (const r of b.rows) ws.addRow(rowValues(r));
    ws.addRow(["BOX TOTAL", "", b.total]).font = { bold: true };
  }
  ws.addRow(["GRAND TOTAL", "", m.quantity]).font = { bold: true };
  for (const row of ws._rows.filter(Boolean))
    row.alignment = { vertical: "top", wrapText: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  const products = wb.addWorksheet("Product Summary");
  products.addRow(["Samples", "Description (optional)", "Quantity"]);
  m.products.forEach((p) =>
    products.addRow([p.code, [...p.descriptions].join(" / "), p.quantity]),
  );
  products.addRow(["GRAND TOTAL", "", m.quantity]);
  products.columns = [{ width: 22 }, { width: 55 }, { width: 18 }];
  const originals = wb.addWorksheet("Original Records");
  originals.addRow(originalHeaders);
  m.records.forEach((r) => originals.addRow(originalValues(r)));
  originals.columns = [20, 18, 25, 14, 18, 55, 40, 30, 40].map((width) => ({
    width,
  }));
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
      table(columns, b.rows.map(rowValues)),
      p(`BOX TOTAL: ${b.total} units`),
    );
  children.push(
    p(`GRAND TOTAL: ${m.quantity} units`, HeadingLevel.HEADING_1),
    p("Overall product summary", HeadingLevel.HEADING_1),
    table(
      ["Samples", "Description (optional)", "Quantity"],
      m.products.map((p) => [
        p.code,
        [...p.descriptions].join(" / "),
        p.quantity,
      ]),
    ),
    p("Original records", HeadingLevel.HEADING_1),
    table(originalHeaders, m.records.map(originalValues)),
    p(`GRAND TOTAL: ${m.quantity} units`, HeadingLevel.HEADING_1),
  );
  return Packer.toBlob(
    new Document({
      sections: [
        {
          properties: {
            page: {
              size: { orientation: "landscape", width: 15840, height: 12240 },
            },
          },
          children,
        },
      ],
    }),
  );
}
export function pdfReport(m) {
  const pdf = new jsPDF({ orientation: "landscape" });
  let y = 18;
  const line = (text, size = 10) => {
    if (y > 185) {
      pdf.addPage();
      y = 18;
    }
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, 265);
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
    if (y > 155) {
      pdf.addPage();
      y = 18;
    }
    line(b.key ? `BOX NO. ${b.label}` : "UNASSIGNED BOX", 14);
    table(columns, b.rows.map(rowValues));
    line(`BOX TOTAL: ${b.total} units`, 12);
  }
  line(`GRAND TOTAL: ${m.quantity} units`, 15);
  line("Overall product summary", 14);
  table(
    ["Samples", "Description (optional)", "Quantity"],
    m.products.map((p) => [
      p.code,
      [...p.descriptions].join(" / "),
      p.quantity,
    ]),
  );
  line("Original records", 14);
  table(originalHeaders, m.records.map(originalValues));
  line(`GRAND TOTAL: ${m.quantity} units`, 15);
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.text(`Shemberg inventory | Page ${i} of ${pages}`, 14, 203);
  }
  return pdf.output("blob");
}
