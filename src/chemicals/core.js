import { repairRegistration, stockCode } from "./numbering.js";
import {
  nextChemicalCode,
  codeBasis,
  shelfReview,
  validateShelfFields,
} from "./operations.js";
export const SCHEMA = 1;
export const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const id = () => {
  if (globalThis.crypto.randomUUID) return globalThis.crypto.randomUUID();
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  return Array.from(
    bytes,
    (v, i) =>
      ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0"),
  ).join("");
};
export const emptyState = () => ({ schema: SCHEMA, bottles: [], events: [] });
export function number(value, label, optional = false) {
  if (value === "" || value === null || value === undefined) {
    if (optional) return null;
    throw new Error(`${label} is required.`);
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0)
    throw new Error(`${label} must be a nonnegative number.`);
  return n;
}
export function validDate(s, label, required = false) {
  if (!s && !required) return "";
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(s) ||
    new Date(s + "T00:00:00Z").toISOString().slice(0, 10) !== s
  )
    throw new Error(`${label} must be a valid date.`);
  return s;
}
export function convert(qty, from, to, density) {
  const n = number(qty, "Quantity");
  if (!["g", "mL"].includes(from) || !["g", "mL"].includes(to))
    throw new Error("Unsupported unit.");
  if (from === to) return n;
  const d = number(density, "Density");
  if (d <= 0)
    throw new Error(
      "A verified density in g/mL is required to convert mass and volume.",
    );
  return from === "g" ? n / d : n * d;
}
export function measuredBalance({ method, amount, tare, unit, density }) {
  if (method === "unmeasured")
    return { balance: null, gross: null, tare: null };
  const a = number(amount, "Measurement");
  if (method === "gross") {
    const t = number(tare, "Container tare", true);
    if (t === null) return { balance: null, gross: a, tare: null };
    if (t > a) throw new Error("Container tare cannot exceed gross weight.");
    return { balance: convert(a - t, "g", unit, density), gross: a, tare: t };
  }
  return {
    balance: convert(a, method === "volume" ? "mL" : "g", unit, density),
    gross: null,
    tare: number(tare, "Container tare", true),
  };
}
export function tracingDetails(b, catalog = []) {
  const source =
    catalog.find((c) => c.id === b.catalogId) ||
    (b.sourceRow && catalog.find((c) => c.sourceRow === b.sourceRow));
  return {
    ...b,
    stockGroup:
      b.stockGroup ||
      (/old[\s_-]*stock/i.test(
        [b.bottleId, b.name, b.sourceGroup, source?.sourceGroup].join(" "),
      )
        ? "old"
        : "active"),
    internalCode:
      b.internalCode ||
      (b.sourceRow || source?.sourceRow
        ? `CHEM-${String(b.sourceRow || source.sourceRow).padStart(3, "0")}`
        : `BOTTLE-${b.id}`),
    labCode: b.labCode || "",
    formulaWeight: b.formulaWeight ?? null,
    densityTemp: b.densityTemp ?? null,
    opened: b.opened || "",
    openedBy: b.openedBy || "",
  };
}
// Adds optional tracing fields only; record keys, quantities and historical events are untouched.
export function upgradeState(state, catalog = []) {
  return {
    ...state,
    bottles: state.bottles.map((b) => tracingDetails(b, catalog)),
  };
}
function stockConvert(qty, from, b) {
  if (b.phase === "Solid" && from !== b.unit)
    throw new Error(
      "Solid stock uses mass; mass-to-volume conversion is not available.",
    );
  return convert(qty, from, b.unit, b.density);
}
export function normalizeBottle(input, existing = []) {
  const b = tracingDetails(input);
  for (const k of ["bottleId", "name", "analyst"])
    if (!String(b[k] || "").trim())
      throw new Error(`${k === "bottleId" ? "Bottle ID" : k} is required.`);
  if (
    existing.some(
      (x) =>
        (b.containerCode && x.containerCode
          ? x.containerCode.toLowerCase() === b.containerCode.toLowerCase()
          : x.bottleId.toLowerCase() === b.bottleId.trim().toLowerCase()) &&
        x.id !== b.id,
    )
  )
    throw new Error("Bottle ID must be unique across both sections.");
  b.bottleId = b.bottleId.trim();
  b.name = b.name.trim();
  if (!["raw", "standard"].includes(b.section) || !["g", "mL"].includes(b.unit))
    throw new Error("Invalid section or stock unit.");
  b.density = number(b.density, "Density", true);
  if (b.density !== null && b.density <= 0)
    throw new Error("Density must be greater than zero.");
  if (!["active", "old"].includes(b.stockGroup))
    throw new Error("Choose Active or Old stock.");
  b.formulaWeight = number(b.formulaWeight, "Formula weight", true);
  if (b.formulaWeight === 0)
    throw new Error("Formula weight must be greater than zero.");
  if (b.densityTemp !== null && b.densityTemp !== "") {
    b.densityTemp = Number(b.densityTemp);
    if (!Number.isFinite(b.densityTemp) || b.densityTemp < -273.15)
      throw new Error("Enter a valid density temperature in °C.");
  } else b.densityTemp = null;
  b.opened = validDate(b.opened, "Date opened");
  if (Boolean(b.opened) !== Boolean(b.openedBy.trim()))
    throw new Error("Record both date opened and who opened it.");
  if (b.received && b.opened && b.opened < b.received)
    throw new Error("Date opened cannot precede date received.");
  b.minimum = number(b.minimum, "Minimum stock", true);
  b.capacity = number(b.capacity, "Full reference amount", true);
  if (b.capacity === 0)
    throw new Error("Full reference amount must be greater than zero.");
  for (const k of ["received", "expiry", "standardDate", "restandardDate"])
    b[k] = validDate(b[k] || "", k);
  if (b.section === "standard") {
    if (!b.concentration?.trim())
      throw new Error("Solution concentration is required.");
    validDate(b.standardDate, "Standardization date", true);
    validDate(b.restandardDate, "Restandardization due date", true);
    if (b.restandardDate < b.standardDate)
      throw new Error(
        "Restandardization due date cannot precede standardization.",
      );
  }
  if (b.received && b.expiry && b.expiry < b.received)
    throw new Error("Expiration cannot precede date received.");
  validateShelfFields(b);
  return b;
}
const rounded = (n) => Math.round(n * 1e9) / 1e9;
function addEvent(state, b, event) {
  const e = {
    id: id(),
    bottleKey: b.id,
    bottleId: b.bottleId,
    name: b.name,
    section: b.section,
    unit: b.unit,
    internalCode: b.internalCode,
    labCode: b.labCode,
    stockGroup: b.stockGroup,
    at: new Date().toISOString(),
    ...event,
  };
  return {
    ...state,
    bottles: state.bottles.some((x) => x.id === b.id)
      ? state.bottles.map((x) => (x.id === b.id ? b : x))
      : [...state.bottles, b],
    events: [...state.events, e],
  };
}
export function register(state, input, measurement, base = []) {
  const b = normalizeBottle({ ...input, id: id() }, state.bottles);
  if (
    b.phase === "Solid" &&
    (b.unit !== "g" || measurement.method === "volume")
  )
    throw new Error("Register solid stock in grams using net or gross mass.");
  Object.assign(
    b,
    measuredBalance({ ...measurement, unit: b.unit, density: b.density }),
  );
  const next = addEvent(state, b, {
    type: "Registered",
    before: null,
    after: b.balance,
    quantity: b.balance,
    analyst: b.analyst,
    reason: "Initial physical inventory",
    measurement: { ...measurement },
    snapshot: { ...b },
  });
  return input.autoNumbering || state.numberingVersion >= 2
    ? repairRegistration(next, base, {
        analyst: b.analyst,
        reason: "Assign bottle sequence after registration",
      })
    : next;
}
export function transact(state, key, input) {
  const old = state.bottles.find((x) => x.id === key);
  if (!old) throw new Error("Bottle not found.");
  if (!input.analyst?.trim() || !input.reason?.trim())
    throw new Error("Analyst and purpose / reason are required.");
  if (old.deleted)
    throw new Error(
      "Removed records must be restored before they can be changed.",
    );
  if (old.disposalStatus === "archived")
    throw new Error("Disposed stock is archived and cannot be changed.");
  const b = { ...old },
    event = {
      type: input.type,
      before: old.balance,
      analyst: input.analyst.trim(),
      reason: input.reason.trim(),
    };
  if (input.type === "Withdrawal") {
    if (input.withdrawalMode === "gross") {
      if (input.sameContainer !== "on" && input.sameContainer !== true)
        throw new Error(
          "Confirm the same bottle, cap and container configuration for both readings.",
        );
      const before = number(input.weightBefore, "Weight before"),
        after = number(input.weightAfter, "Weight after");
      if (after >= before)
        throw new Error("Weight after must be less than weight before.");
      if (b.tare !== null && b.tare !== undefined && after < b.tare)
        throw new Error(
          "Weight after cannot be below the recorded container tare.",
        );
      const removed = rounded(before - after);
      if (old.balance !== null) {
        const q = stockConvert(removed, "g", b);
        if (q > old.balance + 1e-9)
          throw new Error(
            "Measured withdrawal exceeds available net stock. Reconcile with Physical inventory first.",
          );
        b.balance = rounded(Math.max(0, old.balance - q));
        event.stockChange = q;
      }
      b.gross = after;
      b.lastWeight = {
        before,
        after,
        at: new Date().toISOString(),
        basis: "Gross bottle weight (g)",
      };
      event.quantity = removed;
      event.quantityUnit = "g";
      event.enteredAmount = removed;
      event.enteredUnit = "g";
      event.measurement = {
        method: "before-after gross weight",
        before,
        after,
        sameContainer: true,
        previousGross: old.gross ?? null,
        density: b.density,
        densityTemp: b.densityTemp,
        netKnown: old.balance !== null,
      };
    } else {
      if (old.balance === null)
        throw new Error(
          "Use before/after bottle weights, or record a net inventory first.",
        );
      const q = stockConvert(input.amount, input.unit, b);
      if (q <= 0) throw new Error("Withdrawal must be greater than zero.");
      if (q > old.balance + 1e-9)
        throw new Error("Withdrawal exceeds available stock.");
      b.balance = rounded(Math.max(0, old.balance - q));
      event.quantity = q;
      event.quantityUnit = b.unit;
      event.enteredAmount = Number(input.amount);
      event.enteredUnit = input.unit;
      event.conversion = { density: b.density, densityTemp: b.densityTemp };
    }
  } else if (input.type === "Physical inventory") {
    if (b.phase === "Solid" && (b.unit !== "g" || input.method === "volume"))
      throw new Error("Use mass measurements for solid stock.");
    Object.assign(
      b,
      measuredBalance({ ...input, unit: b.unit, density: b.density }),
    );
    event.measurement = {
      method: input.method,
      amount: Number(input.amount),
      tare: input.tare,
      density: b.density,
      densityTemp: b.densityTemp,
    };
    event.quantity =
      b.balance === null || old.balance === null
        ? null
        : rounded(b.balance - old.balance);
  } else if (input.type === "Restandardization") {
    if (b.section !== "standard")
      throw new Error("Only standardized solutions can be restandardized.");
    validDate(input.standardDate, "Standardization date", true);
    validDate(input.restandardDate, "Next due date", true);
    if (input.restandardDate < input.standardDate)
      throw new Error("Next due date cannot precede standardization.");
    if (!input.concentration?.trim())
      throw new Error("Concentration is required.");
    Object.assign(b, {
      standardDate: input.standardDate,
      restandardDate: input.restandardDate,
      concentration: input.concentration.trim(),
      analyst: input.analyst.trim(),
    });
    event.previousStandard = {
      concentration: old.concentration,
      standardDate: old.standardDate,
      restandardDate: old.restandardDate,
      analyst: old.analyst,
    };
    event.standard = {
      concentration: b.concentration,
      standardDate: b.standardDate,
      restandardDate: b.restandardDate,
      analyst: b.analyst,
    };
  } else if (input.type !== "Visual observation")
    throw new Error("Unsupported transaction.");
  const hasHeight =
    input.height !== undefined && input.height !== null && input.height !== "";
  if (input.type === "Visual observation" && !input.visual && !hasHeight)
    throw new Error("Record a visual level or a liquid height.");
  if (input.visual || hasHeight) {
    if (
      input.visual &&
      ![
        "Full",
        "Three-quarter / high",
        "Half / mid",
        "Quarter / low",
        "Empty",
      ].includes(input.visual)
    )
      throw new Error("Choose a valid visual level.");
    if (input.heightUnit && !["cm", "in"].includes(input.heightUnit))
      throw new Error("Choose cm or inches for height.");
    b.observation = {
      visual: input.visual || "Height only",
      height: number(input.height, "Liquid height", true),
      heightUnit: input.heightUnit || "cm",
      at: new Date().toISOString(),
    };
    event.observation = b.observation;
  }
  b.updatedAt = new Date().toISOString();
  event.after = b.balance;
  return addEvent(state, b, event);
}
export function editBottle(state, key, input, base = []) {
  const old = state.bottles.find((x) => x.id === key);
  if (!old) throw new Error("Bottle not found.");
  if (old.deleted)
    throw new Error(
      "Removed records must be restored before they can be changed.",
    );
  if (old.disposalStatus === "archived")
    throw new Error("Disposed stock is archived and cannot be changed.");
  const b = normalizeBottle(
    {
      ...old,
      ...input,
      id: old.id,
      section: old.section,
      unit: old.unit,
      balance: old.balance,
      gross: old.gross,
      tare: old.tare,
    },
    state.bottles,
  );
  if (!input.reason?.trim())
    throw new Error("Reason for metadata correction is required.");
  const next = addEvent(state, b, {
    type: "Details corrected",
    before: old.balance,
    after: b.balance,
    analyst: b.analyst,
    reason: input.reason,
    previous: { ...old },
    snapshot: { ...b },
  });
  return state.numberingVersion >= 2
    ? repairRegistration(next, base, {
        analyst: b.analyst,
        reason: input.reason,
      })
    : next;
}
export function alerts(b, date = today()) {
  if (b.deleted) return ["Removed record"];
  if (b.disposalStatus === "archived") return ["Disposed — archived"];
  if (b.isCatalog) return ["Quantity not entered"];
  const a = [];
  if (b.disposalStatus === "suggested") a.push("Suggested for disposal");
  if (b.balance === null)
    a.push(
      b.gross !== null && b.gross !== undefined
        ? "Gross weight tracked; net unknown"
        : "Needs net inventory",
    );
  else if (b.minimum !== null && b.balance <= b.minimum) a.push("Low stock");
  const review = shelfReview(b, date);
  if (review.overdue) a.push("Shelf-life review due");
  else if (review.missing) a.push("Shelf-life date missing");
  if (b.balance === 0) a.push("Empty");
  if (b.expiry && b.expiry < date) a.push("Expired");
  else if (b.expiry && b.expiry <= plusDays(date, 30))
    a.push("Expires within 30 days");
  if (b.section === "standard" && b.restandardDate && b.restandardDate <= date)
    a.push("Restandardization due");
  else if (
    b.section === "standard" &&
    b.restandardDate &&
    b.restandardDate <= plusDays(date, 30)
  )
    a.push("Restandardize within 30 days");
  return a;
}
function plusDays(date, n) {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function fillLevel(b) {
  if (b.balance === null || !b.capacity) return null;
  const ratio = Math.max(0, Math.min(1, b.balance / b.capacity));
  return {
    percent: Math.round(ratio * 100),
    label:
      ratio === 0
        ? "Empty"
        : ratio >= 0.875
          ? "Full"
          : ratio >= 0.625
            ? "Three-quarter / high"
            : ratio >= 0.375
              ? "Half / mid"
              : ratio >= 0.125
                ? "Quarter / low"
                : "Trace / very low",
  };
}
export function validateBackup(data) {
  if (
    !data ||
    data.schema !== SCHEMA ||
    !Array.isArray(data.bottles) ||
    !Array.isArray(data.events)
  )
    throw new Error(
      "Unsupported backup. Select a Chemicals Inventory JSON backup.",
    );
  const ids = new Set();
  for (const b of data.bottles) {
    if (
      b.containerCode &&
      (typeof b.containerCode !== "string" ||
        data.bottles.some(
          (x) => x.id !== b.id && x.containerCode === b.containerCode,
        ))
    )
      throw new Error("Duplicate stable container code.");
    if (typeof b.id !== "string" || ids.has(b.id))
      throw new Error("Invalid or duplicate bottle key.");
    ids.add(b.id);
    normalizeBottle(
      b,
      data.bottles.filter((x) => x !== b),
    );
    if (
      b.balance !== null &&
      (typeof b.balance !== "number" ||
        !Number.isFinite(b.balance) ||
        b.balance < 0)
    )
      throw new Error("Invalid stock balance.");
  }
  const eventIds = new Set();
  for (const e of data.events) {
    if (
      !e ||
      typeof e.id !== "string" ||
      eventIds.has(e.id) ||
      !ids.has(e.bottleKey) ||
      !Number.isFinite(Date.parse(e.at)) ||
      typeof e.type !== "string" ||
      typeof e.reason !== "string" ||
      typeof e.analyst !== "string"
    )
      throw new Error("Invalid logbook record.");
    eventIds.add(e.id);
    for (const k of ["before", "after"])
      if (
        e[k] !== null &&
        (typeof e[k] !== "number" || !Number.isFinite(e[k]) || e[k] < 0)
      )
        throw new Error("Invalid logbook balance.");
  }
  for (const field of ["registry", "registryEvents"])
    if (data[field] !== undefined && !Array.isArray(data[field]))
      throw new Error("Invalid chemical registry backup.");
  const chemicalIds = new Set();
  for (const c of data.registry || []) {
    if (
      !c ||
      typeof c.id !== "string" ||
      chemicalIds.has(c.id) ||
      typeof c.name !== "string" ||
      !c.name.trim()
    )
      throw new Error("Invalid chemical registry entry.");
    chemicalIds.add(c.id);
    number(c.formulaWeight, "Formula weight", true);
  }
  const registryEventIds = new Set();
  for (const e of data.registryEvents || []) {
    if (
      !e ||
      typeof e.id !== "string" ||
      registryEventIds.has(e.id) ||
      !chemicalIds.has(e.chemicalId) ||
      !Number.isFinite(Date.parse(e.at)) ||
      typeof e.reason !== "string" ||
      typeof e.analyst !== "string"
    )
      throw new Error("Invalid registry history.");
    registryEventIds.add(e.id);
  }
  for (const b of data.bottles) {
    if (
      b.deleted &&
      (!Number.isFinite(Date.parse(b.deleted.at)) ||
        !b.deleted.analyst?.trim() ||
        !b.deleted.reason?.trim())
    )
      throw new Error("Invalid removed record.");
    if (
      b.disposalStatus &&
      !["normal", "suggested", "archived"].includes(b.disposalStatus)
    )
      throw new Error("Invalid disposal status.");
    if (
      b.disposalStatus === "archived" &&
      (!b.disposal ||
        !Number.isFinite(Date.parse(b.disposal.at)) ||
        !b.disposal.reason?.trim() ||
        !b.disposal.analyst?.trim())
    )
      throw new Error("Incomplete disposal archive.");
  }
  return structuredClone({
    schema: SCHEMA,
    ...(data.numberingVersion !== undefined
      ? { numberingVersion: data.numberingVersion }
      : {}),
    bottles: data.bottles,
    events: data.events,
    ...(data.registry !== undefined ? { registry: data.registry } : {}),
    ...(data.registryEvents !== undefined
      ? { registryEvents: data.registryEvents }
      : {}),
  });
}

// Keep each source row, including repeated names in different storage locations.
// Unmeasured stocks are views of the embedded locator, never invented balances.
export function stockRows(catalog, bottles) {
  const linked = new Set(
    bottles.filter((b) => b.section === "raw").map((b) => b.catalogId),
  );
  for (const c of catalog)
    if (c.legacyBottleKey && bottles.some((b) => b.id === c.legacyBottleKey))
      linked.add(c.id);
  return [
    ...bottles,
    ...catalog
      .filter((c) => !linked.has(c.id))
      .map((c) =>
        tracingDetails(
          {
            ...c,
            isCatalog: true,
            section: "raw",
            balance: null,
            unit: "",
            minimum: null,
            capacity: null,
            density: null,
            bottleId: "",
            analyst: "",
          },
          catalog,
        ),
      ),
  ];
}

export function chemicalRegistry(base, state) {
  const overrides = new Map((state.registry || []).map((c) => [c.id, c]));
  const entries = [
    ...base.map((c) => overrides.get(c.id) || c),
    ...(state.registry || []).filter((c) => !base.some((b) => b.id === c.id)),
  ];
  const known = new Set(entries.map((c) => c.id));
  // Expose pre-registry custom raw chemicals without renaming or relinking their bottles.
  for (const b of state.bottles.filter((b) => b.section === "raw")) {
    const key = b.catalogId || "legacy-chemical-" + b.id;
    if (known.has(key)) continue;
    const c = {
      id: key,
      legacyBottleKey: b.id,
      sourceGroup: "Existing bottle record",
      stockGroup: tracingDetails(b).stockGroup,
      internalCode: tracingDetails(b).internalCode,
    };
    for (const field of [
      "name",
      "formula",
      "cas",
      "classification",
      "storage",
      "hazards",
      "formulaWeight",
      "stockGroup",
      "internalCode",
      "labCode",
    ])
      if (b[field] !== undefined) c[field] = b[field];
    entries.push(c);
    known.add(key);
  }
  return entries;
}
export function saveChemical(state, base, input, key = null) {
  const previous = key
    ? chemicalRegistry(base, state).find((c) => c.id === key)
    : null;
  if (key && !previous) throw new Error("Chemical registry entry not found.");
  if (!input.name?.trim() || !input.analyst?.trim() || !input.reason?.trim())
    throw new Error("Chemical name, recorded by and reason are required.");
  const c = {
    ...previous,
    ...input,
    id: previous?.id || "chemical-" + id(),
    name: input.name.trim(),
    formulaWeight: number(input.formulaWeight, "Formula weight", true),
    internalCode:
      input.internalCode?.trim() ||
      (previous
        ? tracingDetails(previous).internalCode
        : nextChemicalCode(state, base, codeBasis(state, base))),
  };
  if (
    (!previous ||
      c.internalCode.toLowerCase() !==
        tracingDetails(previous).internalCode.toLowerCase()) &&
    chemicalRegistry(base, state).some(
      (other) =>
        other.id !== c.id &&
        stockCode(
          tracingDetails(other).internalCode,
          "active",
        ).toLowerCase() === stockCode(c.internalCode, "active").toLowerCase(),
    )
  )
    throw new Error(
      "Chemical code is already assigned to another registry entry.",
    );
  c.internalCode = stockCode(c.internalCode, c.stockGroup || "active");
  if (c.formulaWeight === 0)
    throw new Error("Formula weight must be greater than zero.");
  if (!["active", "old"].includes(c.stockGroup || "active"))
    throw new Error("Choose Active or Old stock.");
  if (!previous) c.sourceGroup = "Added to registry";
  const entry = {
    id: id(),
    chemicalId: c.id,
    at: new Date().toISOString(),
    type: previous ? "Chemical edited" : "Chemical added",
    analyst: input.analyst.trim(),
    reason: input.reason.trim(),
    previous: previous ? { ...previous } : null,
    snapshot: { ...c },
  };
  let next = {
    ...state,
    registry: [...(state.registry || []).filter((x) => x.id !== c.id), c],
    registryEvents: [...(state.registryEvents || []), entry],
  };
  if (previous)
    for (const old of state.bottles.filter(
      (b) =>
        (b.catalogId === c.id || b.id === c.legacyBottleKey) &&
        b.disposalStatus !== "archived" &&
        !b.deleted,
    )) {
      const b = { ...old };
      for (const field of [
        "name",
        "formula",
        "cas",
        "classification",
        "hazards",
        "formulaWeight",
      ])
        b[field] = c[field] ?? "";
      next = addEvent(next, b, {
        type: "Chemical registry updated",
        before: old.balance,
        after: b.balance,
        analyst: entry.analyst,
        reason: entry.reason,
        previous: {
          name: old.name,
          formula: old.formula ?? null,
          cas: old.cas ?? null,
          classification: old.classification ?? null,
          hazards: old.hazards ?? null,
          formulaWeight: old.formulaWeight,
        },
        snapshot: {
          name: b.name,
          formula: b.formula,
          cas: b.cas,
          classification: b.classification,
          hazards: b.hazards,
          formulaWeight: b.formulaWeight,
        },
        registryEventId: entry.id,
      });
    }
  return next;
}
export function setDisposition(state, key, input, base = []) {
  const old = state.bottles.find((b) => b.id === key);
  if (!old) throw new Error("Bottle not found.");
  if (old.deleted)
    throw new Error(
      "Removed records must be restored before they can be changed.",
    );
  if (old.disposalStatus === "archived")
    throw new Error("Disposed stock is already archived.");
  if (!input.analyst?.trim() || !input.reason?.trim())
    throw new Error("Recorded by and reason are required.");
  if (!["suggested", "normal", "archived"].includes(input.status))
    throw new Error("Choose a disposal action.");
  if (
    input.status === "archived" &&
    input.confirm !== "on" &&
    input.confirm !== true
  )
    throw new Error("Confirm this entire container has been disposed.");
  const b = { ...old, disposalStatus: input.status };
  const details = {
    at: new Date().toISOString(),
    analyst: input.analyst.trim(),
    reason: input.reason.trim(),
    reference: input.reference?.trim() || "",
  };
  let type = "Disposal suggestion cleared";
  if (input.status === "suggested") {
    b.disposalSuggestion = details;
    type = "Suggested for disposal";
  }
  if (input.status === "archived") {
    b.disposal = {
      ...details,
      previousBalance: old.balance,
      previousGross: old.gross ?? null,
      unit: old.unit,
    };
    b.balance = old.balance === null ? null : 0;
    type = "Disposed";
  }
  const next = addEvent(state, b, {
    type,
    before: old.balance,
    after: b.balance,
    quantity: input.status === "archived" ? old.balance : null,
    analyst: details.analyst,
    reason: details.reason,
    disposal: {
      ...details,
      status: input.status,
      previousStatus: old.disposalStatus || "normal",
      previousBalance: old.balance,
      previousGross: old.gross ?? null,
    },
  });
  return state.numberingVersion >= 2
    ? repairRegistration(next, base, {
        analyst: details.analyst,
        reason: details.reason,
      })
    : next;
}

export function removeBottle(state, key, input, restore = false, base = []) {
  const old = state.bottles.find((b) => b.id === key);
  if (!old) throw new Error("Bottle not found.");
  if (!input.analyst?.trim() || !input.reason?.trim())
    throw new Error("Recorded by and reason are required.");
  if (restore && !old.deleted) throw new Error("This record is not removed.");
  if (!restore && old.deleted)
    throw new Error("This record is already removed.");
  if (!restore && input.confirm !== true && input.confirm !== "on")
    throw new Error("Confirm removal of this bottle record.");
  const b = { ...old };
  const previous = old.deleted || null;
  if (restore) delete b.deleted;
  else
    b.deleted = {
      at: new Date().toISOString(),
      analyst: input.analyst.trim(),
      reason: input.reason.trim(),
    };
  const next = addEvent(state, b, {
    type: restore ? "Bottle restored" : "Bottle removed",
    before: old.balance,
    after: old.balance,
    analyst: input.analyst.trim(),
    reason: input.reason.trim(),
    removal: { previous, snapshot: b.deleted || null },
  });
  return state.numberingVersion >= 2
    ? repairRegistration(next, base, {
        analyst: input.analyst,
        reason: input.reason,
      })
    : next;
}
