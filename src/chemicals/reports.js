import ExcelJS from "exceljs";
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableRow,
  TableCell,
  TextRun,
  ImageRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { alerts } from "./core.js";
export const bottleColumns = [
  "Section",
  "Bottle ID",
  "Chemical / solution",
  "Concentration",
  "Balance",
  "Unit",
  "Minimum stock",
  "Full reference",
  "Storage",
  "Classification",
  "Formula",
  "CAS",
  "Source hazards (unverified)",
  "Lot / batch",
  "Supplier",
  "Date received",
  "Expiration",
  "Standardized",
  "Restandardization due",
  "Analyst",
  "Density g/mL",
  "Gross g",
  "Container tare g",
  "Visual observation",
  "Liquid height",
  "Height unit",
  "Observation time",
  "Alerts",
  "Notes",
  "Catalog source row",
  "Purity / grade",
  "Physical state",
  "Stock group",
  "Internal chemical code",
  "Lab code",
  "Formula weight g/mol",
  "Density temperature °C",
  "Date opened",
  "Opened by",
  "Disposal status",
  "Disposal date",
  "Disposed by",
  "Disposal reason",
  "Disposal reference",
  "Net before disposal",
  "Gross before disposal g",
];
export const bottleRow = (b) => [
  b.section,
  b.bottleId,
  b.name,
  b.concentration || "",
  b.balance,
  b.unit,
  b.minimum,
  b.capacity,
  b.storage,
  b.classification,
  b.formula,
  b.cas,
  b.hazards,
  b.lot,
  b.supplier,
  b.received,
  b.expiry,
  b.standardDate,
  b.restandardDate,
  b.analyst,
  b.phase === "Solid" ? "Not applicable" : b.density,
  b.gross,
  b.tare,
  b.observation?.visual || "",
  b.observation?.height ?? "",
  b.observation?.heightUnit || "",
  b.observation?.at || "",
  alerts(b).join("; "),
  b.notes,
  b.sourceRow || "",
  b.purity || "",
  b.phase || "",
  b.stockGroup || "",
  b.internalCode || "",
  b.labCode || "",
  b.formulaWeight ?? "",
  b.phase === "Solid" ? "Not applicable" : (b.densityTemp ?? ""),
  b.opened || "",
  b.openedBy || "",
  b.disposalStatus || "normal",
  b.disposal?.at || "",
  b.disposal?.analyst || "",
  b.disposal?.reason || b.disposalSuggestion?.reason || "",
  b.disposal?.reference || b.disposalSuggestion?.reference || "",
  b.disposal?.previousBalance ?? "",
  b.disposal?.previousGross ?? "",
];
export const eventColumns = [
  "Timestamp (UTC)",
  "Bottle ID",
  "Name at event",
  "Section",
  "Action",
  "Before",
  "After",
  "Unit",
  "Change / withdrawal",
  "Analyst",
  "Purpose / reason",
  "Entered quantity",
  "Entered unit",
  "Withdrawal quantity unit",
  "Measurement / observation / standardization details",
];
export const eventRow = (e) => [
  e.at,
  e.bottleId,
  e.name,
  e.section,
  e.type,
  e.before,
  e.after,
  e.unit,
  e.quantity ?? "",
  e.analyst,
  e.reason,
  e.enteredAmount ?? "",
  e.enteredUnit || "",
  e.quantityUnit || e.unit,
  JSON.stringify({
    measurement: e.measurement,
    internalCode: e.internalCode,
    labCode: e.labCode,
    stockGroup: e.stockGroup,
    quantityUnit: e.quantityUnit,
    stockChange: e.stockChange,
    conversion: e.conversion,
    disposal: e.disposal,
    registryEventId: e.registryEventId,
    observation: e.observation,
    previousStandard: e.previousStandard,
    standard: e.standard,
    previous: e.previous,
    snapshot: e.snapshot,
  }),
];
export function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
export function csv(headers, rows) {
  const cell = (x) =>
    '"' +
    String(x ?? "")
      .replace(/^[=+@-]/, "'$&")
      .replaceAll('"', '""') +
    '"';
  return (
    "\ufeff" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n")
  );
}
const pdfText = (s) =>
  String(s ?? "")
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) => String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)))
    .replace(/[ₐₙ]/g, (c) => (c === "ₐ" ? "a" : "n"))
    .replace(/[→]/g, " -> ")
    .replace(/[—–]/g, "-")
    .replace(/[·∙]/g, ".");
export async function exportReport(
  format,
  bottles,
  events,
  catalog,
  logo,
  options = {},
) {
  const stamp = new Date().toISOString(),
    base = "Shemberg-Chemicals-" + stamp.slice(0, 10);
  const intro = `QA Lab Chemicals Inventory | Generated ${stamp} | ${bottles.length} stock entries | ${events.length} log entries. Category: ${options.category || "All categories"}. Current inventory filters apply; includes complete history for selected bottles. Balances use the unit shown; no mixed-unit total. Visual levels are estimates. Locator chemistry/hazards are supplied reference data, not verified SDS. Copyright Jermaine Theus Cahayagan.`;
  if (format === "csv") {
    download(
      new Blob([csv(bottleColumns, bottles.map(bottleRow))], {
        type: "text/csv;charset=utf-8",
      }),
      base + ".csv",
    );
    return;
  }
  if (format === "xlsx") {
    const wb = new ExcelJS.Workbook();
    wb.creator = "Jermaine Theus Cahayagan";
    const cover = wb.addWorksheet("Report notes");
    cover.addRow(["Shemberg QA Lab Chemicals Inventory"]);
    cover.addRow([intro]);
    cover.getColumn(1).width = 120;
    cover.getRow(2).alignment = { wrapText: true };
    cover.getRow(2).height = 85;
    if (logo) {
      const image = wb.addImage({ base64: logo, extension: "png" });
      cover.addImage(image, {
        tl: { col: 0, row: 3 },
        ext: { width: 300, height: 128 },
      });
    }
    for (const [name, headers, rows] of [
      ["Inventory", bottleColumns, bottles.map(bottleRow)],
      ["Withdrawal and audit log", eventColumns, events.map(eventRow)],
      [
        "Chemical registry",
        [
          "Registry ID",
          "Name",
          "Formula",
          "CAS",
          "Classification",
          "Default storage",
          "Hazards",
          "Formula weight g/mol",
          "Default group",
        ],
        catalog.map((c) => [
          c.id,
          c.name,
          c.formula,
          c.cas,
          c.classification,
          c.storage,
          c.hazards,
          c.formulaWeight ?? "",
          c.stockGroup || c.sourceGroup,
        ]),
      ],
      [
        "Registry history",
        [
          "Time UTC",
          "Chemical ID",
          "Action",
          "Recorded by",
          "Reason",
          "Previous details",
          "Updated details",
        ],
        (options.registryEvents || []).map((e) => [
          e.at,
          e.chemicalId,
          e.type,
          e.analyst,
          e.reason,
          JSON.stringify(e.previous),
          JSON.stringify(e.snapshot),
        ]),
      ],
      [
        "Source locator",
        [
          "Name",
          "Formula",
          "Classification",
          "CAS",
          "Hazards",
          "Storage",
          "Source group",
          "Workbook row",
        ],
        (options.sourceCatalog || catalog).map((c) => [
          c.name,
          c.formula,
          c.classification,
          c.cas,
          c.hazards,
          c.storage,
          c.sourceGroup,
          c.sourceRow,
        ]),
      ],
    ]) {
      const ws = wb.addWorksheet(name);
      ws.addRow(headers);
      rows.forEach((r) => ws.addRow(r.map((x) => x ?? "")));
      ws.views = [{ state: "frozen", ySplit: 1 }];
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: rows.length + 1, column: headers.length },
      };
      ws.columns.forEach((c, i) => {
        c.width = i === 2 ? 40 : 23;
      });
      ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      ws.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF185A46" },
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
  const compactHeaders = [
    "Bottle / solution",
    "Stock / location",
    "Traceability",
    "Dates / analyst",
  ];
  const rows = bottles.map((b) => [
    `${b.bottleId}\n${b.name}${b.concentration ? " | " + b.concentration : ""}\n${b.classification || "Unclassified"}\nCAS: ${b.cas || "Not recorded"}\n${b.formula || ""}\nPurity: ${b.purity || "Not recorded"}\nState: ${b.phase || "Not recorded"}\nFormula weight: ${b.formulaWeight ?? "Not recorded"} g/mol`,
    `${b.balance ?? "Unknown"} ${b.unit}\n${b.storage || "Unassigned"}\nMinimum: ${b.minimum ?? "Not set"}\nFull reference: ${b.capacity ?? "Not set"}\nDensity: ${b.phase === "Solid" ? "Not applicable (solid)" : `${b.density ?? "Not set"} g/mL at ${b.densityTemp ?? "unrecorded"} °C`}\nGross / tare: ${b.gross ?? "—"} / ${b.tare ?? "—"} g`,
    `Disposal: ${b.disposalStatus || "normal"}\n${b.disposal ? `Disposed ${b.disposal.at} by ${b.disposal.analyst}\n${b.disposal.reason}\nReference: ${b.disposal.reference}\nNet before: ${b.disposal.previousBalance ?? "unknown"} ${b.unit}; gross ${b.disposal.previousGross ?? "unknown"} g\n` : ""}Group: ${b.stockGroup || "Not recorded"}\nInternal: ${b.internalCode || "Not recorded"}\nLab: ${b.labCode || "Not recorded"}\nLot: ${b.lot || "Not recorded"}\nSupplier: ${b.supplier || "Not recorded"}\nSource row: ${b.sourceRow || "Custom"}\n${b.hazards || ""}\nNotes: ${b.notes || "—"}`,
    `Opened: ${b.opened || "—"} by ${b.openedBy || "—"}\nReceived: ${b.received || "—"}\nExpires: ${b.expiry || "—"}\nStandardized: ${b.standardDate || "—"}\nDue: ${b.restandardDate || "—"}\nAnalyst: ${b.analyst}\n${alerts(b).join("; ")}\nObserved: ${b.observation ? `${b.observation.visual}; ${b.observation.height ?? "—"} ${b.observation.heightUnit}; ${b.observation.at}` : "—"}`,
  ]);
  const logHeaders = [
    "Time / bottle",
    "Action / analyst",
    "Balance",
    "Purpose / details",
  ];
  const logRows = events.map((e) => [
    `${e.at}\n${e.bottleId}\n${e.name}`,
    `${e.type}\n${e.analyst}`,
    `${e.before ?? "Unknown"} → ${e.after ?? "Unknown"} ${e.unit}\nAmount: ${e.quantity ?? "—"} ${e.quantityUnit || e.unit}\nEntered: ${e.enteredAmount ?? "—"} ${e.enteredUnit || ""}`,
    `${e.reason}\n${eventRow(e).at(-1)}`,
  ]);
  for (const e of options.registryEvents || [])
    logRows.push([
      `${e.at}\nRegistry: ${e.chemicalId}`,
      `${e.type}\n${e.analyst}`,
      "Chemical details only",
      `${e.reason}\nPrevious: ${JSON.stringify(e.previous)}\nUpdated: ${JSON.stringify(e.snapshot)}`,
    ]);
  if (format === "pdf") {
    const pdf = new jsPDF({ orientation: "landscape" });
    if (logo) pdf.addImage(logo, "PNG", 14, 9, 60, 25.5);
    pdf.setFontSize(17);
    pdf.text("QA Lab Chemicals Inventory", 83, 20);
    pdf.setFontSize(8);
    pdf.text(pdf.splitTextToSize(intro, 265), 14, 41);
    autoTable(pdf, {
      head: [compactHeaders],
      body: rows.map((r) => r.map(pdfText)),
      startY: 61,
      styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
      headStyles: { fillColor: [24, 90, 70] },
      rowPageBreak: "avoid",
    });
    pdf.addPage();
    pdf.setFontSize(14);
    pdf.text("Withdrawal & audit logbook", 14, 16);
    autoTable(pdf, {
      head: [logHeaders],
      body: logRows.map((r) => r.map(pdfText)),
      startY: 23,
      styles: { fontSize: 7, overflow: "linebreak" },
      headStyles: { fillColor: [24, 90, 70] },
      rowPageBreak: "avoid",
    });
    const pages = pdf.getNumberOfPages();
    for (let n = 1; n <= pages; n++) {
      pdf.setPage(n);
      pdf.setFontSize(7);
      pdf.text(
        `Shemberg QA | Jermaine Theus Cahayagan | Page ${n} of ${pages}`,
        14,
        204,
      );
    }
    download(pdf.output("blob"), base + ".pdf");
    return;
  }
  if (format === "docx") {
    const text = (s) =>
      new Paragraph({ children: [new TextRun(String(s ?? ""))] });
    const table = (headers, data) =>
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            tableHeader: true,
            children: headers.map(
              (h) =>
                new TableCell({
                  shading: { fill: "DCEDE5" },
                  children: [text(h)],
                }),
            ),
          }),
          ...data.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (v) =>
                    new TableCell({
                      children: String(v ?? "")
                        .split("\n")
                        .map(text),
                    }),
                ),
              }),
          ),
        ],
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
              transformation: { width: 270, height: 115 },
            }),
          ],
        }),
      );
    children.push(
      new Paragraph({
        text: "Shemberg QA Lab Chemicals Inventory",
        heading: "Heading1",
      }),
      text(intro),
      table(compactHeaders, rows),
      new Paragraph({
        text: "Withdrawal & audit logbook",
        heading: "Heading1",
        pageBreakBefore: true,
      }),
      table(logHeaders, logRows),
    );
    const doc = new Document({
      creator: "Jermaine Theus Cahayagan",
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
