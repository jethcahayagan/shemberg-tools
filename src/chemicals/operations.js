import {
  chemicalRegistry,
  tracingDetails,
  today,
  validDate,
  number,
} from "./core.js";
export function codeHistory(state, base) {
  const codes = [];
  const add = (r) => {
    if (r?.internalCode)
      codes.push(
        String(r.internalCode).replace(
          /^(?:(?:OLD|OLS)\s*STOCK|ACTIVE)\s*[-:]?\s*/i,
          "",
        ),
      );
  };
  for (const c of base) add(tracingDetails(c));
  for (const c of chemicalRegistry(base, state)) add(tracingDetails(c));
  for (const b of state.bottles) add(b);
  for (const e of [...(state.events || []), ...(state.registryEvents || [])]) {
    add(e);
    add(e.previous);
    add(e.snapshot);
  }
  return codes;
}
export function codeBasis(state, base) {
  const codes = codeHistory(state, base);
  for (const code of codes.toReversed()) {
    if (/^BOTTLE-/i.test(code)) continue;
    const m = code.match(/^(.*?)(\d+)$/);
    if (m) return { prefix: m[1], padding: Math.max(3, m[2].length) };
  }
  return { prefix: "CHEM-", padding: 3 };
}
export function nextChemicalCode(
  state,
  base,
  { prefix = "CHEM-", padding = 3 } = {},
) {
  prefix = prefix
    .trim()
    .replace(/^(?:(?:OLD|OLS)\s*STOCK|ACTIVE)\s*[-:]?\s*/i, "");
  padding = Number(padding);
  if (
    prefix.length > 40 ||
    !Number.isInteger(padding) ||
    padding < 1 ||
    padding > 12
  )
    throw new Error(
      "Use a code prefix of at most 40 characters and 1–12 number digits.",
    );
  let max = 0;
  for (const code of codeHistory(state, base))
    if (
      code.slice(0, prefix.length).toLowerCase() === prefix.toLowerCase() &&
      /^\d+$/.test(code.slice(prefix.length))
    ) {
      const n = Number(code.slice(prefix.length));
      if (!Number.isSafeInteger(n))
        throw new Error("Existing code exceeds the supported numbering range.");
      max = Math.max(max, n);
    }
  if (!Number.isSafeInteger(max + 1))
    throw new Error("Code sequence is exhausted.");
  return prefix + String(max + 1).padStart(padding, "0");
}
function addMonths(date, months) {
  const d = new Date(date + "T12:00:00Z"),
    day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const end = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(day, end));
  return d.toISOString().slice(0, 10);
}
export function shelfReview(b, date = today()) {
  const result = { due: "", basis: "", overdue: false, missing: false };
  if (b.isCatalog || b.deleted || b.disposalStatus === "archived")
    return result;
  const months =
    b.shelfLifeMonths === "" ||
    b.shelfLifeMonths === null ||
    b.shelfLifeMonths === undefined
      ? 24
      : Number(b.shelfLifeMonths);
  const candidates = [];
  if (!b.expiry && months > 0) {
    const start = b.manufactured || b.received;
    if (start)
      candidates.push({
        due: addMonths(start, months),
        basis: b.manufactured
          ? "Manufacture date"
          : "Date received (age estimate)",
      });
    else result.missing = true;
  }
  const openedMonths = Number(b.openedLifeMonths || 0);
  if (b.opened && openedMonths > 0)
    candidates.push({
      due: addMonths(b.opened, openedMonths),
      basis: "Opened-container review",
    });
  if (candidates.length) {
    candidates.sort((a, b) => a.due.localeCompare(b.due));
    Object.assign(result, candidates[0]);
    result.overdue = result.due <= date;
  }
  return result;
}
export function validateShelfFields(b) {
  if (b.manufactured) validDate(b.manufactured, "Manufacture date");
  for (const k of ["shelfLifeMonths", "openedLifeMonths"])
    if (b[k] !== undefined && b[k] !== "" && b[k] !== null) {
      const n = number(b[k], k);
      if (!Number.isInteger(n) || n > 1200)
        throw new Error(
          "Shelf-life periods must be whole months from 0 to 1200.",
        );
    }
  if (b.manufactured && b.received && b.manufactured > b.received)
    throw new Error("Manufacture date cannot follow date received.");
}
export function chemicalOverview(rows) {
  const groups = new Map();
  for (const b of rows.filter(
    (b) => !b.deleted && b.disposalStatus !== "archived",
  )) {
    const norm = (s) =>
      String(s || "")
        .trim()
        .replace(/\s+/g, " ")
        .toLowerCase();
    const key = JSON.stringify([
      b.section,
      norm(b.name),
      norm(b.cas),
      norm(b.formula),
      norm(b.concentration),
      norm(b.purity),
    ]);
    if (!groups.has(key))
      groups.set(key, {
        key,
        name: b.name,
        cas: b.cas || "",
        concentration: b.concentration || "",
        purity: b.purity || "",
        rows: [],
        bottles: 0,
        unknown: 0,
        grams: 0,
        milliliters: 0,
        hasGrams: false,
        hasMilliliters: false,
        suggested: 0,
        storages: new Set(),
        codes: new Set(),
        ids: [],
      });
    const g = groups.get(key);
    g.rows.push(b);
    if (b.storage) g.storages.add(b.storage);
    if (b.internalCode) g.codes.add(b.internalCode);
    if (b.isCatalog) continue;
    g.bottles++;
    g.ids.push(b.bottleId);
    if (b.disposalStatus === "suggested") g.suggested++;
    if (b.balance === null) g.unknown++;
    else if (b.unit === "g") {
      g.grams += b.balance;
      g.hasGrams = true;
    } else if (b.unit === "mL") {
      g.milliliters += b.balance;
      g.hasMilliliters = true;
    }
  }
  return [...groups.values()].map((g) => ({
    ...g,
    storages: [...g.storages],
    codes: [...g.codes],
  }));
}
