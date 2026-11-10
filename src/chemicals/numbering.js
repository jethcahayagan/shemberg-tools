import { chemicalRegistry, tracingDetails, id, saveChemical } from "./core.js";
import { nextChemicalCode } from "./operations.js";
const norm = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const cas = (v) =>
  String(v || "")
    .trim()
    .replace(/\.$/, "");
const formula = (v) =>
  norm(
    String(v || "").replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (c) =>
      String("₀₁₂₃₄₅₆₇₈₉".indexOf(c)),
    ),
  );
export const stripStockPrefix = (code) =>
  String(code || "")
    .trim()
    .replace(/^(?:(?:OLD|OLS)\s*STOCK|ACTIVE)\s*[-:]?\s*/i, "");
export function stockCode(code, group) {
  let bare = stripStockPrefix(code);
  const match = bare.match(/^CHEM[ -]*(\d+)$/i);
  if (match) bare = "CHEM-" + String(Number(match[1])).padStart(3, "0");
  return (group === "old" ? "OLD STOCK " : "") + bare;
}
export function rawCode(code) {
  const bare = stripStockPrefix(code),
    m = bare.match(/^CHEM-(\d+)$/i);
  return m ? "RAW-" + m[1] : "RAW-" + bare.replace(/\s+/g, "-");
}
const alias = (values, value, current) => [
  ...new Set([
    ...(values || []),
    ...(value && value !== current ? [value] : []),
  ]),
];
const traceKeys = [
  "catalogId",
  "sourceRow",
  "internalCode",
  "bottleId",
  "stockGroup",
  "bottleSequence",
  "containerCode",
  "legacyBottleIds",
  "legacyInternalCodes",
  "numberingReview",
];
const trace = (b) =>
  Object.fromEntries(
    traceKeys.filter((k) => b[k] !== undefined).map((k) => [k, b[k]]),
  );
function appendBottleEvent(
  state,
  b,
  previous,
  now,
  analyst,
  reason,
  type = "Registration numbering updated",
) {
  return {
    id: id(),
    bottleKey: b.id,
    bottleId: b.bottleId,
    name: b.name,
    section: b.section,
    unit: b.unit,
    internalCode: b.internalCode,
    stockGroup: b.stockGroup,
    labCode: b.labCode,
    at: now,
    type,
    before: b.balance,
    after: b.balance,
    analyst,
    reason,
    previous: trace(previous),
    snapshot: trace(b),
  };
}
export function repairRegistration(
  state,
  base,
  {
    analyst = "Registration updater",
    reason = "Normalize chemical codes and bottle numbering",
    now = new Date().toISOString(),
  } = {},
) {
  let next = { ...state, bottles: state.bottles.map((b) => ({ ...b })) };
  const original = new Map(state.bottles.map((b) => [b.id, b]));
  const defs = chemicalRegistry(base, state);
  const overrides = new Map(
    (state.registry || []).map((c) => [c.id, { ...c }]),
  );
  const registryEvents = [...(state.registryEvents || [])];
  // A mismatched link is repaired only with a unique matching name AND CAS in the registry.
  for (const b of next.bottles.filter((b) => b.section === "raw")) {
    let source =
      defs.find((c) => c.id === b.catalogId) ||
      defs.find((c) => c.legacyBottleKey === b.id);
    if (source && cas(b.cas) && cas(source.cas) !== cas(b.cas)) {
      const matches = defs.filter(
        (c) => norm(c.name) === norm(b.name) && cas(c.cas) === cas(b.cas),
      );
      if (matches.length === 1) {
        b.catalogId = matches[0].id;
        b.sourceRow = matches[0].sourceRow ?? null;
        source = matches[0];
      }
    }
    if (source && !b.catalogId) b.catalogId = source.id;
    if (
      source &&
      b.formula &&
      source.formula &&
      formula(b.formula) !== formula(source.formula)
    )
      b.numberingReview =
        "Bottle formula differs from the linked registry. Formula retained; verify label/SDS.";
  }
  const codeOwners = new Map();
  for (const definition of defs) {
    const peers = next.bottles.filter(
      (b) => b.section === "raw" && b.catalogId === definition.id,
    );
    const groups = [
      ...new Set(
        peers.map((b) => b.stockGroup || tracingDetails(b).stockGroup),
      ),
    ];
    const group =
      groups.length === 1 ? groups[0] : tracingDetails(definition).stockGroup;
    let bare = stripStockPrefix(tracingDetails(definition).internalCode);
    if (/^BOTTLE-/i.test(bare))
      bare = nextChemicalCode(
        { ...next, registry: [...overrides.values()] },
        base,
        { prefix: "CHEM-", padding: 3 },
      );
    if (
      codeOwners.has(bare.toLowerCase()) &&
      codeOwners.get(bare.toLowerCase()) !== definition.id
    )
      bare = nextChemicalCode(
        { ...next, registry: [...overrides.values()] },
        base,
        { prefix: "CHEM-", padding: 3 },
      );
    codeOwners.set(bare.toLowerCase(), definition.id);
    const updated = {
      ...definition,
      stockGroup: group,
      internalCode: stockCode(bare, group),
    };
    if (
      updated.internalCode !== definition.internalCode ||
      updated.stockGroup !== definition.stockGroup
    ) {
      updated.legacyInternalCodes = alias(
        definition.legacyInternalCodes,
        definition.internalCode,
        updated.internalCode,
      );
      overrides.set(updated.id, updated);
      registryEvents.push({
        id: id(),
        chemicalId: updated.id,
        at: now,
        type: "Chemical numbering updated",
        analyst,
        reason,
        previous: { ...definition },
        snapshot: { ...updated },
      });
    }
    for (const b of peers) {
      const code = stockCode(updated.internalCode, b.stockGroup || group);
      b.legacyInternalCodes = alias(
        b.legacyInternalCodes,
        b.internalCode,
        code,
      );
      b.internalCode = code;
    }
  }
  next.registry = [...overrides.values()];
  next.registryEvents = registryEvents;
  const liveDefs = chemicalRegistry(base, next);
  for (const c of liveDefs) {
    const peers = next.bottles.filter(
      (b) => b.section === "raw" && b.catalogId === c.id,
    );
    if (!peers.length) continue;
    const reserved = new Set();
    for (const b of peers) {
      const parsed = Number(
        String(b.bottleId || "").match(/^(\d+)\s*\/\s*\d+/)?.[1],
      );
      const seq = Number(b.bottleSequence) || parsed;
      if (seq > 0 && Number.isInteger(seq) && !reserved.has(seq)) {
        b.bottleSequence = seq;
        reserved.add(seq);
      } else delete b.bottleSequence;
    }
    let slot = 1;
    for (const b of peers)
      if (!b.bottleSequence) {
        while (reserved.has(slot)) slot++;
        b.bottleSequence = slot;
        reserved.add(slot);
      }
    const baseId = rawCode(c.internalCode || tracingDetails(c).internalCode);
    for (const b of peers)
      if (!b.containerCode)
        b.containerCode =
          baseId + "-B" + String(b.bottleSequence).padStart(3, "0");
    const live = peers
      .filter((b) => !b.deleted && b.disposalStatus !== "archived")
      .sort((a, b) => a.bottleSequence - b.bottleSequence);
    live.forEach((b, i) => {
      const label =
        live.length > 1 ? `${i + 1}/${live.length} ${baseId}` : baseId;
      b.legacyBottleIds = alias(b.legacyBottleIds, b.bottleId, label);
      b.bottleId = label;
    });
  }
  const added = [];
  for (const b of next.bottles) {
    const old = original.get(b.id);
    if (JSON.stringify(trace(old)) !== JSON.stringify(trace(b)))
      added.push(appendBottleEvent(next, b, old, now, analyst, reason));
  }
  next.events = [...state.events, ...added];
  next.numberingVersion = 2;
  return next;
}
export function nextBottleDetails(state, source) {
  const peers = state.bottles.filter(
    (b) =>
      b.section === "raw" &&
      (b.catalogId === source.id || b.id === source.legacyBottleKey),
  );
  const slot =
    Math.max(
      0,
      ...peers.map(
        (b, i) =>
          Number(b.bottleSequence) ||
          Number(String(b.bottleId).match(/^(\d+)\//)?.[1]) ||
          i + 1,
      ),
    ) + 1;
  const group =
    source.stockGroup ||
    peers.at(-1)?.stockGroup ||
    tracingDetails(source).stockGroup;
  const code = stockCode(tracingDetails(source).internalCode, group),
    base = rawCode(code),
    count =
      peers.filter((b) => !b.deleted && b.disposalStatus !== "archived")
        .length + 1;
  return {
    stockGroup: group,
    internalCode: code,
    bottleId: count > 1 ? `${count}/${count} ${base}` : base,
    bottleSequence: slot,
    containerCode: base + "-B" + String(slot).padStart(3, "0"),
  };
}
export function bottleTemplate(state, source, templateKey = null) {
  const peers = state.bottles.filter(
    (b) =>
      b.section === "raw" &&
      !b.deleted &&
      b.disposalStatus !== "archived" &&
      (b.catalogId === source.id || b.id === source.legacyBottleKey),
  );
  const previous = peers.find((b) => b.id === templateKey) || peers.at(-1);
  const draft = { ...source };
  for (const key of [
    "name",
    "formula",
    "cas",
    "classification",
    "hazards",
    "storage",
    "formulaWeight",
    "labCode",
    "supplier",
    "lot",
    "received",
    "expiry",
    "purity",
    "phase",
    "density",
    "densityTemp",
    "minimum",
    "capacity",
    "unit",
    "analyst",
    "notes",
    "manufactured",
    "shelfLifeMonths",
    "openedLifeMonths",
  ])
    if (previous?.[key] !== undefined) draft[key] = previous[key];
  Object.assign(draft, nextBottleDetails(state, source), {
    opened: "",
    openedBy: "",
    tare: null,
    autoNumbering: true,
  });
  return { draft, previous };
}
export function changeChemicalGroup(
  state,
  base,
  key,
  group,
  { analyst, reason },
) {
  if (!["old", "active"].includes(group) || !analyst?.trim() || !reason?.trim())
    throw new Error("Stock group, recorded by and reason are required.");
  const c = chemicalRegistry(base, state).find((c) => c.id === key);
  if (!c) throw new Error("Chemical not found.");
  const updated = {
    ...c,
    stockGroup: group,
    internalCode: stockCode(tracingDetails(c).internalCode, group),
  };
  let next = {
    ...state,
    registry: [...(state.registry || []).filter((r) => r.id !== key), updated],
    registryEvents: [
      ...(state.registryEvents || []),
      {
        id: id(),
        chemicalId: key,
        at: new Date().toISOString(),
        type: "Stock group changed",
        analyst,
        reason,
        previous: { ...c },
        snapshot: { ...updated },
      },
    ],
    bottles: state.bottles.map((b) =>
      (b.catalogId === key || b.id === c.legacyBottleKey) &&
      !b.deleted &&
      b.disposalStatus !== "archived"
        ? { ...b, stockGroup: group }
        : b,
    ),
  };
  const repaired = repairRegistration(next, base, { analyst, reason });
  // Retain the actual pre-change group in the audit even when labels were already normalized.
  for (const old of state.bottles.filter(
    (b) =>
      (b.catalogId === key || b.id === c.legacyBottleKey) &&
      !b.deleted &&
      b.disposalStatus !== "archived",
  )) {
    const b = repaired.bottles.find((b) => b.id === old.id);
    repaired.events.push(
      appendBottleEvent(
        repaired,
        b,
        old,
        new Date().toISOString(),
        analyst,
        reason,
        "Stock group changed",
      ),
    );
  }
  return repaired;
}
export function addInventorySupplement(
  state,
  base,
  entries,
  {
    analyst = "Inventory reconciliation",
    reason = "Add missing November 2026 registry definitions",
  } = {},
) {
  let next = state;
  for (const entry of entries) {
    const defs = chemicalRegistry(base, next);
    if (
      defs.some(
        (c) =>
          c.id === entry.id ||
          (norm(c.name) === norm(entry.name) && cas(c.cas) === cas(entry.cas)),
      )
    )
      continue;
    const code = nextChemicalCode(next, base, { prefix: "CHEM-", padding: 3 });
    next = saveChemical(next, base, {
      ...entry,
      internalCode: code,
      analyst,
      reason,
    });
    // Use the source row key to keep repeated reconciliation idempotent across computers.
    const created = next.registry.at(-1),
      oldKey = created.id;
    created.id = entry.id;
    next.registryEvents = next.registryEvents.map((e) =>
      e.chemicalId === oldKey
        ? {
            ...e,
            chemicalId: entry.id,
            snapshot: { ...e.snapshot, id: entry.id },
          }
        : e,
    );
  }
  return next;
}
export function updateInventoryBackup(state, base, entries, options = {}) {
  return addInventorySupplement(
    repairRegistration(state, base, options),
    base,
    entries,
    options,
  );
}
