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
import {
  exactAmount as amount,
  reportContext,
  contextText,
  reportBands,
  fullDetailTable,
  fullDetailCsv,
} from "./report-data.js";
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
  ["unit", "Stock unit", (b) => b.unit || ""],
  ["tare", "Empty container weight (g)", (b) => b.tare ?? "Not entered"],
  [
    "density",
    "Verified density (g/mL)",
    (b) =>
      b.phase === "Solid" ? "Not applicable" : (b.density ?? "Not entered"),
  ],
  [
    "densityTemp",
    "Density temperature (°C)",
    (b) =>
      b.phase === "Solid" ? "Not applicable" : (b.densityTemp ?? "Not entered"),
  ],
  ["phase", "Physical state", (b) => b.phase || ""],
  ["purity", "Purity / grade", (b) => b.purity || ""],
  [
    "minimum",
    "Minimum stock",
    (b) => (b.minimum == null ? "Not set" : amount(b.minimum) + " " + b.unit),
  ],
  [
    "capacity",
    "Full reference amount",
    (b) => (b.capacity == null ? "Not set" : amount(b.capacity) + " " + b.unit),
  ],
  ["standardDate", "Standardization date", (b) => b.standardDate || ""],
  ["analyst", "Analyst", (b) => b.analyst || ""],
  ["visual", "Visual estimate", (b) => b.observation?.visual || ""],
  [
    "height",
    "Observed liquid height",
    (b) =>
      b.observation?.height == null
        ? "Not recorded"
        : amount(b.observation.height) + " " + b.observation.heightUnit,
  ],
  ["observedAt", "Observation date (UTC)", (b) => b.observation?.at || ""],
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
        "Balance before",
        "Balance after",
        "Recorded by",
        "Purpose / details",
      ],
      rows: events.map((e) => [
        e.at.replace("T", " ").replace("Z", " UTC"),
        e.name + " / " + e.bottleId,
        e.type,
        e.quantity === null || e.quantity === undefined
          ? "—"
          : amount(e.quantity) + " " + (e.quantityUnit || e.unit),
        e.before == null ? "Unknown" : amount(e.before) + " " + e.unit,
        e.after == null ? "Unknown" : amount(e.after) + " " + e.unit,
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
  const stamp = new Date().toISOString(),
    base = "Shemberg-Chemical-Report-" + stamp.slice(0, 10);
  const context = reportContext(options, bottles.length, stamp);
  const meta = contextText(context);
  if (format === "fullcsv") {
    download(
      new Blob(
        [fullDetailCsv(fullDetailTable(bottles, events, options, context))],
        { type: "text/csv;charset=utf-8" },
      ),
      base + "-Full-Detail.csv",
    );
    return;
  }
  const tables = readableTables(bottles, events, options);
  const note =
    "Blank or not entered means unknown. Net g and mL stay separate; gross weight is not net stock. Shelf-life flags request review, not automatic expiry.";
  if (format === "csv") {
    const parts = tables
      .map((t) => csv(t.headers, t.rows).replace(/^\uFEFF/, ""))
      .join("\r\n\r\n");
    download(
      new Blob(
        [
          csv(
            ["Report information", "Value"],
            [
              ["Exported at (UTC)", context.exportedAt],
              ["App version", context.appVersion],
              ["Scope", context.scope],
              ["Category", context.category],
              ["Filters", JSON.stringify(context.filters)],
            ],
          ) +
            "\r\n\r\n" +
            parts,
        ],
        { type: "text/csv;charset=utf-8" },
      ),
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
      ws.getRow(1).font = { size: 18, bold: true };
      ws.getRow(2).font = { size: 11, color: { argb: "FF303B2F" } };
      ws.getRow(2).height = Math.max(
        60,
        Math.ceil(meta.length / Math.max(20, n * 18)) * 16,
      );
      ws.getRow(4).font = { size: 12, bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(4).height = 34;
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
          ? 42
          : 24;
        c.alignment = { vertical: "top", wrapText: true };
      });
      ws.eachRow((row, index) => {
        if (index >= 5) {
          row.font = { size: 12 };
          row.height = Math.min(
            409,
            Math.max(
              32,
              ...row.values.slice(1).map(
                (value) =>
                  String(value ?? "")
                    .split("\n")
                    .reduce(
                      (n, line) => n + Math.max(1, Math.ceil(line.length / 26)),
                      0,
                    ) * 18,
              ),
            ),
          );
          if (index % 2 === 1)
            row.fill = {
              type: "pattern",
              pattern: "solid",
              fgColor: { argb: "FFF1F4EF" },
            };
        }
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
    pdf.setFontSize(11);
    const metaLines = pdf.splitTextToSize(pdfText(meta), 265);
    pdf.text(metaLines, 14, 31);
    pdf.setFontSize(10);
    const noteY = 31 + metaLines.length * 5 + 3;
    const noteLines = pdf.splitTextToSize(note, 265);
    pdf.text(noteLines, 14, noteY);
    let y = noteY + noteLines.length * 5 + 8;
    for (const t of tables.flatMap((table) => reportBands(table))) {
      if (y > 140) {
        pdf.addPage();
        y = 15;
      }
      pdf.setFontSize(12);
      pdf.text(t.name, 14, y);
      autoTable(pdf, {
        head: [t.headers],
        body: t.rows.map((r) => r.map(pdfText)),
        startY: y + 5,
        margin: { bottom: 22 },
        styles: {
          fontSize: 11,
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
      pdf.setFontSize(9);
      pdf.text(
        `App ${context.appVersion} | Exported ${stamp} | Page ${p} of ${pages}`,
        14,
        198,
      );
      pdf.text("Jermaine Theus Cahayagan", 14, 204);
    }
    download(pdf.output("blob"), base + ".pdf");
    return;
  }
  if (format === "docx") {
    const para = (s, bold = false) =>
      new Paragraph({
        children: [new TextRun({ text: String(s ?? ""), bold, size: 24 })],
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
    for (const t of tables.flatMap((table) => reportBands(table))) {
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
      styles: { default: { document: { run: { font: "Arial", size: 24 } } } },
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
