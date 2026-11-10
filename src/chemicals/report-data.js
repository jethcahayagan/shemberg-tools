import { APP_VERSION } from "./version.js";
export const exactAmount = (value) =>
  value === null || value === undefined ? "Not entered" : String(value);
export function reportContext(
  options = {},
  count = 0,
  stamp = new Date().toISOString(),
) {
  return Object.freeze({
    exportedAt: stamp,
    appVersion: APP_VERSION,
    scope: options.scope || "Inventory",
    category: options.category || "All categories",
    filters: Object.freeze({ ...options.filters }),
    count,
    sections: ["inventory", "overview", "log"].filter((key) =>
      key === "inventory" ? options[key] !== false : options[key],
    ),
    fields: [...(options.fields || [])],
  });
}
export function contextText(context) {
  const filters =
    Object.entries(context.filters)
      .filter(([, v]) => v !== "" && v !== null && v !== undefined)
      .map(([k, v]) => `${k}: ${v}`)
      .join("; ") || "None";
  return `Exported ${context.exportedAt} | App ${context.appVersion}\n${context.scope} | ${context.category} | ${context.count} selected entries\nFilters: ${filters}`;
}
// Repeat identity columns when a wide print table is split, retaining every selected field.
export function reportBands(table, limit = 6) {
  if (table.headers.length <= limit) return [table];
  const identity = table.headers
    .map((h, i) =>
      /^(Chemical \/ solution|Bottle ID|Chemical \/ bottle|Recorded \(UTC\))$/.test(
        h,
      )
        ? i
        : -1,
    )
    .filter((i) => i >= 0)
    .slice(0, 2);
  if (!identity.length) identity.push(0);
  const others = table.headers
    .map((_, i) => i)
    .filter((i) => !identity.includes(i));
  const bands = [];
  for (let start = 0; start < others.length; start += limit - identity.length) {
    const indices = [
      ...identity,
      ...others.slice(start, start + limit - identity.length),
    ].sort((a, b) => a - b);
    bands.push({
      name: table.name + (start ? " — more details" : ""),
      headers: indices.map((i) => table.headers[i]),
      rows: table.rows.map((row) => indices.map((i) => row[i])),
    });
  }
  return bands;
}
export function fullDetailTable(
  bottles,
  events,
  options = {},
  context = reportContext(options, bottles.length),
) {
  const records = [],
    masterKeys = new Set(
      bottles.flatMap((b) => [b.catalogId, b.id]).filter(Boolean),
    );
  if (options.inventory !== false || options.overview)
    for (const b of bottles) {
      const original = options.originalBottles?.find((old) => old.id === b.id);
      records.push({
        type: b.isCatalog ? "Unmeasured registry entry" : "Bottle",
        data: original || b,
      });
    }
  if (options.log)
    for (const event of events) records.push({ type: "Activity", data: event });
  if (options.inventory !== false || options.overview) {
    for (const chemical of options.registry || [])
      if (masterKeys.has(chemical.id))
        records.push({ type: "Chemical definition", data: chemical });
    for (const event of options.registryEvents || [])
      if (masterKeys.has(event.chemicalId))
        records.push({ type: "Chemical registry history", data: event });
  }
  if (!records.length) throw Error("No selected records to export.");
  const keys = [
    ...new Set(records.flatMap((record) => Object.keys(record.data))),
  ].sort();
  const headers = [
    "Record_type",
    "Record_ID",
    "Exported_at_UTC",
    "App_version",
    "Scope",
    "Category",
    "Filters_JSON",
    "Readable_quantity",
    "Readable_recorded_time",
    ...keys.map((key) => "Data." + key),
  ];
  const rows = records.map(({ type, data }) => [
    type,
    data.id,
    context.exportedAt,
    context.appVersion,
    context.scope,
    context.category,
    JSON.stringify(context.filters),
    data.balance !== undefined && data.balance !== null
      ? exactAmount(data.balance) + " " + (data.unit || "")
      : data.quantity !== undefined && data.quantity !== null
        ? exactAmount(data.quantity) +
          " " +
          (data.quantityUnit || data.unit || "")
        : "Not entered",
    data.at ? new Date(data.at).toLocaleString() : "",
    ...keys.map((key) =>
      Object.hasOwn(data, key) && data[key] !== undefined
        ? JSON.stringify(data[key])
        : "",
    ),
  ]);
  return { name: "Full detail", headers, rows };
}
export function fullDetailCsv(table) {
  // Original string values use JSON encoding (including quotes); this preserves types,
  // nulls, nested history and formula-like text without modifying the original value.
  const cell = (value) => '"' + String(value ?? "").replaceAll('"', '""') + '"';
  return (
    "\ufeff" +
    [table.headers, ...table.rows]
      .map((row) => row.map(cell).join(","))
      .join("\r\n")
  );
}
