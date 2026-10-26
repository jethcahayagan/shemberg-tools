export const collator = new Intl.Collator("en", {
  numeric: true,
  sensitivity: "base",
});
export function boxKey(value) {
  const s = String(value ?? "").trim();
  return /^\d+$/.test(s) ? s.replace(/^0+(?=\d)/, "") : s.toUpperCase();
}
export function normalize(input) {
  const date = String(input.date ?? "").trim(),
    code = String(input.code ?? "").trim(),
    description = String(input.description ?? "").trim(),
    box = String(input.box ?? "").trim(),
    remarks = String(input.remarks ?? "");
  const quantity = Number(input.quantity);
  const sampleDate = String(input.sampleDate ?? "").trim();
  if (
    sampleDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(sampleDate) ||
      Number.isNaN(Date.parse(sampleDate)) ||
      new Date(sampleDate).toISOString().slice(0, 10) !== sampleDate)
  )
    throw Error("Sample date must be a valid YYYY-MM-DD date.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    Number.isNaN(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("Inventory date must be a valid YYYY-MM-DD date.");
  if (!code) throw Error("Samples (sample name or code) is required.");
  if (
    String(input.quantity ?? "").trim() === "" ||
    !Number.isSafeInteger(quantity) ||
    quantity < 0
  )
    throw Error("Quantity must be a nonnegative whole number.");
  if (
    code.length > 100 ||
    description.length > 500 ||
    box.length > 100 ||
    remarks.length > 2000
  )
    throw Error("Text exceeds field length limits.");
  return {
    ...input,
    date,
    code,
    description,
    quantity,
    box,
    remarks,
    sampleDate,
  };
}
export function fingerprint(r) {
  return JSON.stringify([
    r.date,
    r.code.toUpperCase(),
    r.description,
    r.quantity,
    boxKey(r.box),
    r.remarks,
    r.sampleDate || "",
  ]);
}
export function compareSamples(a, b) {
  return (
    (a.sampleDate || "9999-12-31").localeCompare(
      b.sampleDate || "9999-12-31",
    ) ||
    collator.compare(a.code, b.code) ||
    a.date.localeCompare(b.date)
  );
}
export function sortOriginals(records) {
  return [...records].sort((a, b) => {
    const ak = boxKey(a.box),
      bk = boxKey(b.box);
    return (
      (ak === bk ? 0 : !ak ? 1 : !bk ? -1 : collator.compare(ak, bk)) ||
      compareSamples(a, b)
    );
  });
}
export function consolidate(records) {
  const boxes = new Map();
  for (const [index, r] of records.entries()) {
    const key = boxKey(r.box);
    if (!boxes.has(key))
      boxes.set(key, {
        key,
        label: r.box || "UNASSIGNED BOX",
        entries: new Map(),
        total: 0,
      });
    const b = boxes.get(key),
      k = JSON.stringify([
        r.date,
        r.sampleDate || `undated-original-${index}`,
        r.code.toUpperCase(),
      ]);
    if (!b.entries.has(k))
      b.entries.set(k, {
        date: r.date,
        sampleDate: r.sampleDate,
        code: r.code,
        quantity: 0,
        sources: [],
        descriptions: [],
        remarks: [],
      });
    const row = b.entries.get(k);
    row.quantity += r.quantity;
    row.sources.push(r);
    if (!row.descriptions.includes(r.description))
      row.descriptions.push(r.description);
    if (r.remarks) row.remarks.push(r.remarks);
    b.total += r.quantity;
  }
  return [...boxes.values()]
    .sort((a, b) => (!a.key ? 1 : !b.key ? -1 : collator.compare(a.key, b.key)))
    .map((b) => ({
      ...b,
      rows: [...b.entries.values()].sort(compareSamples),
    }));
}
export function summarize(records) {
  const boxes = consolidate(records),
    products = new Map();
  for (const r of records) {
    const k = r.code.toUpperCase();
    if (!products.has(k))
      products.set(k, { code: r.code, descriptions: new Set(), quantity: 0 });
    const p = products.get(k);
    p.descriptions.add(r.description);
    p.quantity += r.quantity;
  }
  return {
    boxes,
    products: [...products.values()].sort((a, b) =>
      collator.compare(a.code, b.code),
    ),
    quantity: records.reduce((n, r) => n + r.quantity, 0),
    originalCount: records.length,
    consolidatedCount: boxes.reduce((n, b) => n + b.rows.length, 0),
    boxCount: boxes.filter((b) => b.key).length,
  };
}
export function duplicateFlags(existing, incoming) {
  const seen = new Set(existing.map(fingerprint));
  return incoming.map((r) => {
    const f = fingerprint(r),
      duplicate = seen.has(f);
    seen.add(f);
    return duplicate;
  });
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else throw Error("Invalid CSV quoting.");
    } else if (c === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (quoted) throw Error("Unclosed CSV quotation.");
  row.push(cell);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
const aliases = {
  date: ["inventorydate", "dateofinventory", "inventorysessiondate"],
  code: [
    "samples",
    "sample",
    "samplecode",
    "samplename",
    "productcode",
    "code",
    "sku",
  ],
  description: [
    "productdescription",
    "description",
    "descriptionoptional",
    "productname",
  ],
  quantity: ["quantity", "qty", "units"],
  box: ["boxnumber", "boxno", "box"],
  remarks: ["remarks", "notes"],
  sampleDate: ["sampledate", "date", "preparationdate"],
  sessionAt: [
    "entrytimestamp",
    "sessiontimestamp",
    "inventorysession",
    "sessionat",
  ],
};
export function importRows(rows, defaults = {}) {
  if (rows.length < 2)
    throw Error("The file needs a header and at least one data row.");
  const headers = rows[0].map((x) =>
    String(x ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, ""),
  );
  const mapping = Object.fromEntries(
    Object.entries(aliases).map(([k, v]) => [
      k,
      headers.findIndex((h) => v.includes(h)),
    ]),
  );
  for (const key of ["sampleDate", "code", "quantity"])
    if (mapping[key] < 0)
      throw Error(`Missing column: ${key}. Use the provided CSV template.`);
  return rows
    .slice(1)
    .filter((r) => r.some((x) => String(x ?? "").trim()))
    .map((row, i) => {
      try {
        const r = Object.fromEntries(
          Object.entries(mapping).map(([k, n]) => [
            k,
            n < 0 ? "" : (row[n] ?? ""),
          ]),
        );
        if (mapping.date < 0) r.date = defaults.inventoryDate || "";
        if (mapping.box < 0) r.box = defaults.box || "";
        if (!defaults.allowUndated && !String(r.sampleDate ?? "").trim())
          throw Error("Date (sample date) is required.");
        if (!r.date)
          throw Error(
            "Date of Inventory is required. Set it in the sheet header or include a Date of Inventory column.",
          );
        if (r.date instanceof Date) r.date = r.date.toISOString().slice(0, 10);
        if (typeof r.date === "number")
          r.date = new Date(Date.UTC(1899, 11, 30) + r.date * 86400000)
            .toISOString()
            .slice(0, 10);
        if (r.sampleDate instanceof Date)
          r.sampleDate = r.sampleDate.toISOString().slice(0, 10);
        if (typeof r.sampleDate === "number")
          r.sampleDate = new Date(
            Date.UTC(1899, 11, 30) + r.sampleDate * 86400000,
          )
            .toISOString()
            .slice(0, 10);
        if (r.sessionAt) {
          const d = new Date(r.sessionAt);
          if (!Number.isFinite(d.getTime()))
            throw Error("Invalid session timestamp");
          r.sessionAt = d.toISOString();
        }
        return normalize(r);
      } catch (e) {
        throw Error(`Row ${i + 2}: ${e.message}`);
      }
    });
}
