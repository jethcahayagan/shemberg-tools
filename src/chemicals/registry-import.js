import ExcelJS from "exceljs";
import { parseCSV } from "../core.js";
import { chemicalRegistry, saveChemical, tracingDetails } from "./core.js";
import { nextChemicalCode, codeBasis } from "./operations.js";
const aliases = {
  name: ["chemicalname", "chemicalsolution", "chemical", "name"],
  formula: ["molecularformula", "formula"],
  cas: ["casnumber", "cas"],
  classification: ["classification", "category", "type"],
  storage: ["storage", "storagelocation", "defaultstorage"],
  hazards: ["keyhazards", "hazards"],
  formulaWeight: ["formulaweightgmol", "formulaweight", "molecularweight"],
  stockGroup: ["stockgroup", "defaultstockgroup", "sourcegroup"],
  labCode: ["labcode"],
  purity: ["purity", "grade"],
};
const norm = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export async function readRegistryFile(file) {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Registry file must be at most 10 MB.");
  if (/\.csv$/i.test(file.name)) return parseCSV(await file.text());
  if (!/\.xlsx$/i.test(file.name))
    throw new Error("Select a CSV or .xlsx file.");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("Workbook has no worksheet.");
  if (ws.rowCount > 5001)
    throw new Error("Import at most 5,000 registry rows at a time.");
  const rows = [];
  ws.eachRow({ includeEmpty: true }, (r) =>
    rows.push(
      Array.from(
        { length: Math.min(ws.columnCount, 40) },
        (_, i) => r.getCell(i + 1).text,
      ),
    ),
  );
  return rows;
}
const fingerprint = (c) =>
  [c.name, c.cas, c.formula, c.storage, c.purity]
    .map((x) =>
      String(x || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase(),
    )
    .join("\u0001");
export function previewRegistryImport(
  rows,
  state,
  base,
  basis = codeBasis(state, base),
) {
  if (!rows.length) throw new Error("File is empty.");
  if (rows.length > 5001) throw new Error("Import at most 5,000 rows.");
  const headers = rows[0].map(norm),
    mapping = {};
  for (const [key, names] of Object.entries(aliases)) {
    const columns = headers
      .map((h, i) => (names.includes(h) ? i : -1))
      .filter((i) => i >= 0);
    if (columns.length > 1) throw new Error("Duplicate " + key + " columns.");
    mapping[key] = columns[0] ?? -1;
  }
  if (mapping.name < 0)
    throw new Error(
      "The first row must contain a Chemical name header. Download the template for supported columns.",
    );
  const seen = new Set(chemicalRegistry(base, state).map(fingerprint));
  let staged = state;
  let sourceGroup = "active";
  return rows.slice(1).flatMap((row, index) => {
    if (!row.some((x) => String(x ?? "").trim())) return [];
    const input = {};
    for (const [key, col] of Object.entries(mapping))
      if (col >= 0) input[key] = String(row[col] ?? "").trim();
    if (["chemicalname", "chemicalsolution"].includes(norm(input.name))) {
      sourceGroup = "active";
      return [];
    }
    if (
      [
        "oldstock",
        "activestock",
        "active",
        "laboratoryreagentschemicals",
        "locator",
      ].includes(norm(input.name)) &&
      !Object.entries(input).some(([k, v]) => k !== "name" && v)
    ) {
      if (norm(input.name) === "oldstock") sourceGroup = "old";
      else if (
        norm(input.name) === "activestock" ||
        norm(input.name) === "active"
      )
        sourceGroup = "active";
      return [];
    }
    if (!input.name)
      throw new Error("Row " + (index + 2) + ": chemical name is required.");
    if (input.stockGroup) {
      const group = norm(input.stockGroup);
      if (["old", "oldstock"].includes(group)) input.stockGroup = "old";
      else if (["active", "locatorstock", "addedtoregistry"].includes(group))
        input.stockGroup = "active";
      else
        throw new Error(
          "Row " + (index + 2) + ": stock group must be Active or Old stock.",
        );
    } else input.stockGroup = sourceGroup;
    if (
      input.formulaWeight &&
      (!Number.isFinite(Number(input.formulaWeight)) ||
        Number(input.formulaWeight) <= 0)
    )
      throw new Error(
        "Row " + (index + 2) + ": formula weight must be positive.",
      );
    const duplicate = seen.has(fingerprint(input));
    seen.add(fingerprint(input));
    const code = duplicate ? "" : nextChemicalCode(staged, base, basis);
    if (!duplicate)
      staged = {
        ...staged,
        registry: [
          ...(staged.registry || []),
          { ...input, id: "preview-" + index, internalCode: code },
        ],
      };
    return [{ line: index + 2, input, duplicate, code }];
  });
}
export function applyRegistryImport(
  preview,
  selected,
  state,
  base,
  { analyst, reason, basis },
) {
  if (!analyst?.trim() || !reason?.trim())
    throw new Error("Recorded by and import reference are required.");
  const rows = preview.filter((r, i) => selected.has(i) && !r.duplicate);
  if (!rows.length)
    throw new Error(
      "Select at least one new chemical. Existing duplicates are not imported.",
    );
  let next = state;
  for (const row of rows) {
    const current = chemicalRegistry(base, next);
    if (current.some((c) => fingerprint(c) === fingerprint(row.input)))
      throw new Error(
        "The registry changed since preview. Reopen the import preview.",
      );
    const prefix = basis.prefix
      .trim()
      .replace(/^(?:(?:OLD|OLS)\s*STOCK|ACTIVE)\s*[-:]?\s*/i, "");
    const currentNext = nextChemicalCode(next, base, basis);
    if (
      Number(row.code.slice(prefix.length)) <
      Number(currentNext.slice(prefix.length))
    )
      throw new Error(
        "Code numbering changed since preview. Preview the import again.",
      );
    next = saveChemical(next, base, {
      ...row.input,
      internalCode: row.code,
      analyst,
      reason: "Registry import: " + reason,
    });
  }
  return next;
}
export const registryTemplate =
  "Chemical name,Molecular formula,CAS number,Classification,Storage,Key hazards,Formula weight,Stock group,Lab code,Purity\r\n";
