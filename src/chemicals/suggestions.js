// Suggestions are derived from saved records. No separate cache or storage migration.
const repeatableFields = [
  "supplier",
  "storage",
  "labCode",
  "classification",
  "purity",
  "lot",
  "concentration",
  "name",
  "formula",
  "cas",
  "hazards",
  "notes",
];
const reasonTypes = {
  Withdrawal: ["Withdrawal"],
  "Physical inventory": ["Physical inventory"],
  Restandardization: ["Restandardization"],
  "Visual observation": ["Visual observation"],
  "Correct bottle details": ["Details corrected"],
  "Disposal record": [
    "Suggested for disposal",
    "Disposal suggestion cleared",
    "Disposed",
  ],
};
export function savedSuggestions(state, catalog = [], context = "") {
  const values = new Map(
    [...repeatableFields, "people", "reason"].map((k) => [k, new Map()]),
  );
  const add = (field, value) => {
    if (typeof value !== "string" || !value.trim()) return;
    const text = value.trim();
    const key = text.replace(/\s+/g, " ").toLocaleLowerCase();
    if (!values.get(field).has(key)) values.get(field).set(key, text);
  };
  const collect = (record, depth = 0) => {
    if (!record || typeof record !== "object" || depth > 3) return;
    for (const field of repeatableFields) add(field, record[field]);
    add("people", record.analyst);
    add("people", record.openedBy);
    for (const nested of [
      "snapshot",
      "previous",
      "standard",
      "previousStandard",
      "disposal",
      "disposalSuggestion",
      "measurement",
    ])
      collect(record[nested], depth + 1);
  };
  // Prefer recent saved spelling while retaining values from older snapshots and archives.
  for (const e of [...(state.events || [])].reverse()) {
    collect(e);
    if (reasonTypes[context]?.includes(e.type)) add("reason", e.reason);
  }
  for (const e of [...(state.registryEvents || [])].reverse()) {
    collect(e);
    if (context === "Add chemical" || context === "Edit chemical")
      add("reason", e.reason);
  }
  for (const b of [...(state.bottles || [])].reverse()) collect(b);
  for (const c of [...(state.registry || [])].reverse()) collect(c);
  for (const c of catalog) collect(c);
  const result = {};
  for (const [field, entries] of values)
    result[field] = [...entries.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base", numeric: true }),
    );
  result.analyst = result.people;
  result.openedBy = result.people;
  delete result.people;
  return result;
}
