import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { download, csv } from "./reports.js";
import { alerts } from "./core.js";
import { chemicalOverview, shelfReview } from "./operations.js";
const amount = (n) =>
  n === null || n === undefined
    ? "Not entered"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(n);
export const reportFields = [
  ["internalCode", "Code", (b) => b.internalCode || ""],
  [
    "name",
    "Chemical / solution",
    (b) => [b.name, b.concentration].filter(Boolean).join(" · "),
  ],
  ["bottleId", "Bottle ID", (b) => b.bottleId || "Not recorded"],
  ["containerCode", "Stable container code", (b) => b.containerCode || ""],
  [
    "legacyBottleIds",
    "Previous bottle labels",
    (b) => (b.legacyBottleIds || []).join("; "),
  ],
  [
    "quantity",
    "Quantity",
    (b) =>
      b.balance === null ? "Not entered" : amount(b.balance) + " " + b.unit,
  ],
  ["storage", "Storage", (b) => b.storage || ""],
  ["lot", "Lot / batch", (b) => b.lot || ""],
  ["expiry", "Expiration", (b) => b.expiry || "Not recorded"],
  [
    "status",
    "Status",
    (b) => (b.deleted ? "Removed record" : alerts(b).join("; ") || "In stock"),
  ],
  ["supplier", "Supplier", (b) => b.supplier || ""],
  ["labCode", "Lab code", (b) => b.labCode || ""],
  ["received", "Received", (b) => b.received || ""],
  ["opened", "Opened", (b) => b.opened || ""],
  ["openedBy", "Opened by", (b) => b.openedBy || ""],
  ["classification", "Classification", (b) => b.classification || ""],
  ["formula", "Formula", (b) => b.formula || ""],
  ["cas", "CAS", (b) => b.cas || ""],
  ["formulaWeight", "Formula weight (g/mol)", (b) => b.formulaWeight ?? ""],
  [
    "gross",
    "Last gross weight",
    (b) =>
      b.gross === null || b.gross === undefined
        ? "Not entered"
        : amount(b.gross) + " g",
  ],
  [
    "review",
    "Shelf-life review",
    (b) => {
      const r = shelfReview(b);
      return r.due ? `${r.due} (${r.basis})` : r.missing ? "Date needed" : "—";
    },
  ],
  ["restandardDate", "Restandardization due", (b) => b.restandardDate || ""],
  ["notes", "Notes", (b) => b.notes || ""],
  [
    "disposal",
    "Disposal details",
    (b) =>
      b.disposal
        ? `${b.disposal.at.slice(0, 10)} · ${b.disposal.analyst} · ${b.disposal.reason} · ${b.disposal.reference}`
        : b.disposalSuggestion?.reason || "",
  ],
  [
    "priorQuantity",
    "Quantity before disposal",
    (b) =>
      b.disposal ? amount(b.disposal.previousBalance) + " " + b.unit : "",
  ],
];
export const defaultReportFields = [
  "internalCode",
  "name",
  "bottleId",
  "quantity",
  "storage",
  "lot",
  "expiry",
  "status",
];
export function readableTables(bottles, events, options = {}) {
  const tables = [];
  if (options.inventory !== false) {
    const fields = reportFields.filter(([k]) =>
      (options.fields || defaultReportFields).includes(k),
    );
    if (!fields.length)
      throw new Error("Select at least one inventory column.");
    tables.push({
      name: "Inventory",
      headers: fields.map((f) => f[1]),
      rows: bottles.map((b) => fields.map((f) => f[2](b))),
    });
  }
  if (options.overview) {
    const rows = chemicalOverview(bottles);
    tables.push({
      name: "Chemical overview",
      headers: [
        "Chemical / solution",
        "Bottles recorded",
        "Known balances",
        "Unknown bottle quantities",
        "Storage",
        "Bottle IDs",
        "Review / other alerts",
      ],
      rows: rows.map((g) => [
        g.name + (g.concentration ? " · " + g.concentration : ""),
        g.bottles,
        [
          g.hasGrams ? amount(g.grams) + " g" : "",
          g.hasMilliliters ? amount(g.milliliters) + " mL" : "",
        ]
          .filter(Boolean)
          .join("; ") || "Not entered",
        g.unknown,
        g.storages.join("; "),
        g.ids.join("; "),
        [
          ...new Set(
            g.rows.filter((b) => !b.isCatalog).flatMap((b) => alerts(b)),
          ),
        ].join("; "),
      ]),
    });
  }
  if (options.log)
    tables.push({
      name: "Withdrawal and activity log",
      headers: [
        "Recorded (UTC)",
        "Chemical / bottle",
        "Action",
        "Quantity",
        "Balance after",
        "Recorded by",
        "Purpose / details",
      ],
      rows: events.map((e) => [
        e.at.replace("T", " ").slice(0, 19),
        e.name + " / " + e.bottleId,
        e.type,
        e.quantity === null || e.quantity === undefined
          ? "—"
          : amount(e.quantity) + " " + (e.quantityUnit || e.unit),
        e.after === null ? "Unknown" : amount(e.after) + " " + e.unit,
        e.analyst,
        [
          e.reason,
          e.measurement?.method === "before-after gross weight"
            ? `Gross: ${e.measurement.before} → ${e.measurement.after} g`
            : "",
          e.disposal?.reference,
          e.removal?.snapshot ? "Record removed" : "",
        ]
          .filter(Boolean)
          .join("; "),
      ]),
    });
  if (!tables.length) throw new Error("Select report contents.");
  if (!tables.some((t) => t.rows.length))
    throw new Error("No records match the selected report sections.");
  return tables;
}
const pdfText = (s) =>
  String(s ?? "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)))
    .replace(/→/g, " -> ")
    .replace(/[—–]/g, "-")
    .replace(/·/g, " | ");
export async function exportReadable(
  format,
  bottles,
  events,
  logo,
  options = {},
) {
  const tables = readableTables(bottles, events, options),
    stamp = new Date().toISOString(),
    base = "Shemberg-Chemical-Report-" + stamp.slice(0, 10);
  const meta = `Generated ${stamp.replace("T", " ").slice(0, 19)} UTC | ${options.scope || "Inventory"} | ${options.category || "All categories"} | ${bottles.length} selected entries`;
  const note =
    "Blank or not entered means unknown. Net g and mL stay separate; gross weight is not net stock. Shelf-life flags request review, not automatic expiry.";
  if (format === "csv") {
    const parts = tables
      .map((t) => csv(t.headers, t.rows).replace(/^\uFEFF/, ""))
      .join("\r\n\r\n");
    download(
      new Blob(["\ufeff" + parts], { type: "text/csv;charset=utf-8" }),
      base + ".csv",
    );
    return;
  }
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Jermaine Theus Cahayagan";
    for (const table of tables) {
      const ws = wb.addWorksheet(table.name.slice(0, 31)),
        n = table.headers.length;
      ws.addRow(["Shemberg QA Lab Chemicals Inventory"]);
      ws.addRow([meta]);
      ws.addRow([table.name]);
      ws.addRow(table.headers);
      table.rows.forEach((r) => ws.addRow(r));
      ws.mergeCells(1, 1, 1, n);
      ws.mergeCells(2, 1, 2, n);
      ws.mergeCells(3, 1, 3, n);
      ws.getRow(1).font = { size: 16, bold: true };
      ws.getRow(2).font = { size: 10, color: { argb: "FF555555" } };
      ws.getRow(4).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(4).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF235C37" },
      };
      ws.views = [{ state: "frozen", ySplit: 4 }];
      ws.autoFilter = {
        from: { row: 4, column: 1 },
        to: { row: Math.max(4, table.rows.length + 4), column: n },
      };
      ws.columns.forEach((c, i) => {
        c.width = /chemical|details|status|alerts|known balances/i.test(
          table.headers[i],
        )
          ? 34
          : 20;
        c.alignment = { vertical: "top", wrapText: true };
      });
      ws.eachRow((r, index) => {
        if (index >= 5)
          r.height = Math.max(
            30,
            Math.min(
              150,
              Math.max(
                ...r.values
                  .slice(1)
                  .map(
                    (v) =>
                      String(v ?? "").split("\n").length +
                      Math.floor(String(v ?? "").length / 30),
                  ),
              ) * 15,
            ),
          );
      });
      ws.addRow([]);
      ws.addRow([note]);
      ws.addRow([
        "© " + new Date().getFullYear() + " Jermaine Theus Cahayagan",
      ]);
      ws.pageSetup = {
        orientation: "landscape",
        paperSize: 9,
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0,
        printTitlesRow: "1:4",
      };
    }
    download(
      new Blob([await wb.xlsx.writeBuffer()], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      }),
      base + ".xlsx",
    );
    return;
  }
  if (format === "pdf") {
    const pdf = new jsPDF({ orientation: "landscape" });
    (await import("./pdf-font.js")).setReportFont(pdf);
    if (logo) pdf.addImage(logo, "PNG", 14, 8, 37, 15.8);
    pdf.setFontSize(16);
    pdf.text("Shemberg QA Lab Chemicals Inventory", 58, 17);
    pdf.setFontSize(9);
    pdf.text(meta, 14, 31);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(note, 265), 14, 37);
    let y = 52;
    for (const t of tables) {
      if (y > 175) {
        pdf.addPage();
        y = 15;
      }
      pdf.setFontSize(12);
      pdf.text(t.name, 14, y);
      autoTable(pdf, {
        head: [t.headers],
        body: t.rows.map((r) => r.map(pdfText)),
        startY: y + 5,
        margin: { bottom: 16 },
        styles: {
          fontSize: t.headers.length > 9 ? 7 : 9,
          font: "ReportSans",
          cellPadding: 2.5,
          overflow: "linebreak",
        },
        headStyles: { fillColor: [35, 92, 55] },
        rowPageBreak: "avoid",
      });
      y = pdf.lastAutoTable.finalY + 15;
    }
    const pages = pdf.getNumberOfPages();
    for (let p = 1; p <= pages; p++) {
      pdf.setPage(p);
      pdf.setFontSize(8);
      pdf.text(`Jermaine Theus Cahayagan | Page ${p} of ${pages}`, 14, 204);
    }
    download(pdf.output("blob"), base + ".pdf");
    return;
  }
  if (format === "docx") {
    const para = (s, bold = false) =>
      new Paragraph({
        children: [new TextRun({ text: String(s ?? ""), bold, size: 18 })],
        spacing: { after: 80 },
      });
    const children = [];
    if (logo)
      children.push(
        new Paragraph({
          children: [
            new ImageRun({
              type: "png",
              data: Uint8Array.from(atob(logo.split(",")[1]), (c) =>
                c.charCodeAt(0),
              ),
              transformation: { width: 180, height: 77 },
            }),
          ],
        }),
      );
    children.push(
      new Paragraph({
        text: "Shemberg QA Lab Chemicals Inventory",
        heading: "Heading1",
      }),
      para(meta),
      para(note),
    );
    for (const t of tables) {
      children.push(
        new Paragraph({ text: t.name, heading: "Heading2" }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: t.headers.map(
                (h) =>
                  new TableCell({
                    shading: { fill: "E6ECE5" },
                    children: [para(h, true)],
                  }),
              ),
            }),
            ...t.rows.map(
              (r) =>
                new TableRow({
                  children: r.map(
                    (v) => new TableCell({ children: [para(v)] }),
                  ),
                }),
            ),
          ],
        }),
      );
    }
    children.push(
      para("© " + new Date().getFullYear() + " Jermaine Theus Cahayagan"),
    );
    const doc = new Document({
      creator: "Jermaine Theus Cahayagan",
      styles: { default: { document: { run: { font: "Arial", size: 18 } } } },
      sections: [
        {
          properties: {
            page: {
              size: { orientation: "landscape", width: 16838, height: 11906 },
            },
          },
          children,
        },
      ],
    });
    download(await Packer.toBlob(doc), base + ".docx");
  }
}
