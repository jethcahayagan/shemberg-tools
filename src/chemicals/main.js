import "./style.css";
import sourceCatalog from "./catalog.json";
let catalog = sourceCatalog;
import logo from "./logo.avif?inline";
import {
  emptyState,
  today,
  register,
  transact,
  editBottle,
  alerts,
  fillLevel,
  validateBackup,
  stockRows,
  upgradeState,
  tracingDetails,
  chemicalRegistry,
  saveChemical,
  setDisposition,
  removeBottle,
} from "./core.js";
import { download } from "./reports.js";
import {
  codeBasis,
  nextChemicalCode,
  chemicalOverview,
  shelfReview,
} from "./operations.js";
import {
  readRegistryFile,
  previewRegistryImport,
  applyRegistryImport,
  registryTemplate,
} from "./registry-import.js";
import {
  exportReadable,
  reportFields,
  defaultReportFields,
} from "./readable-reports.js";
import { savedSuggestions } from "./suggestions.js";
import supplement from "./inventory-supplement.json";
import {
  repairRegistration,
  updateInventoryBackup,
  nextBottleDetails,
  bottleTemplate,
  stockCode,
  changeChemicalGroup,
} from "./numbering.js";
const KEY = "shemberg-qa-chemicals-v1";
let state = emptyState(),
  storageError = "",
  section = "raw",
  view = "inventory",
  query = "",
  storage = "",
  category = "",
  status = "",
  stockScope = "",
  inventoryLayout = "bottles",
  sort = "name",
  logQuery = "",
  pendingRestore = null;
try {
  const saved = localStorage.getItem(KEY);
  if (saved) {
    const parsed = validateBackup(JSON.parse(saved));
    catalog = chemicalRegistry(sourceCatalog, parsed);
    state = upgradeState(parsed, catalog);
  }
} catch (e) {
  storageError =
    "Saved inventory could not be opened. It has not been overwritten. Export the stored data below before restoring a valid backup. " +
    e.message;
}
const app = document.querySelector("#chem-app");
const esc = (x) =>
  String(x ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const num = (x) =>
  x === null || x === undefined
    ? "Not entered"
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 3 }).format(x);
const fmtDate = (x) => (x ? esc(x) : "—");
const group = (c) => {
  const s = (c || "").toLowerCase();
  return /indicator/.test(s)
    ? "Indicators"
    : /acid/.test(s)
      ? "Acids"
      : /base/.test(s)
        ? "Bases"
        : /oxidiz/.test(s)
          ? "Oxidizers"
          : /salt/.test(s)
            ? "Salts"
            : /solvent/.test(s)
              ? "Solvents"
              : "Other / unclassified";
};
function commit(next) {
  if (storageError)
    throw new Error(
      "Storage needs recovery. Download the existing data and restore a valid backup first.",
    );
  localStorage.setItem(KEY, JSON.stringify(next));
  state = next;
  catalog = chemicalRegistry(sourceCatalog, state);
  render();
}
function toast(s, error = false) {
  let el = document.querySelector("#toast");
  el.textContent = s;
  el.className = error ? "toast error show" : "toast show";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove("show"), 5000);
}
function selected(includeDefaults = false, ignoreCategory = false) {
  return (includeDefaults ? stockRows(catalog, state.bottles) : state.bottles)
    .filter((b) =>
      view === "removed"
        ? !!b.deleted
        : view === "archive"
          ? b.disposalStatus === "archived" && !b.deleted
          : b.section === section &&
            b.disposalStatus !== "archived" &&
            !b.deleted,
    )
    .filter(
      (b) =>
        view === "archive" ||
        view === "removed" ||
        section !== "raw" ||
        !stockScope ||
        b.stockGroup === stockScope,
    )
    .filter(
      (b) =>
        !query ||
        [
          b.name,
          b.bottleId,
          b.containerCode,
          (b.legacyBottleIds || []).join(" "),
          (b.legacyInternalCodes || []).join(" "),
          b.internalCode,
          b.labCode,
          b.cas,
          b.formula,
          b.classification,
          b.storage,
          b.lot,
          b.supplier,
          b.concentration,
          b.notes,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .filter((b) => !storage || b.storage === storage)
    .filter(
      (b) =>
        ignoreCategory || !category || group(b.classification) === category,
    )
    .filter(
      (b) =>
        !status ||
        (status === "alerts"
          ? alerts(b).length
          : status === "low"
            ? alerts(b).includes("Low stock")
            : status === "unknown"
              ? b.balance === null
              : status === "expired"
                ? alerts(b).includes("Expired")
                : status === "shelf"
                  ? shelfReview(b).overdue
                  : status === "disposal"
                    ? b.disposalStatus === "suggested"
                    : alerts(b).some((x) => x.includes("standardiz"))),
    )
    .sort((a, b) =>
      sort === "balance"
        ? a.unit.localeCompare(b.unit) ||
          (a.balance ?? Infinity) - (b.balance ?? Infinity)
        : String(a[sort] || "zzzz").localeCompare(
            String(b[sort] || "zzzz"),
            undefined,
            { numeric: true, sensitivity: "base" },
          ),
    );
}
function badges(b) {
  if (b.isCatalog) return "—";
  const a = alerts(b);
  return a.length
    ? a
        .map(
          (t) =>
            `<span class="badge ${/Expired|due|Low stock|Empty/.test(t) ? "warn" : "muted"}">${esc(t)}</span>`,
        )
        .join(" ")
    : '<span class="badge good">In stock</span>';
}
function level(b) {
  const f = fillLevel(b);
  if (!f && !b.observation) return "";
  return `<div class="level"><span class="level-track"><i style="width:${f?.percent || 0}%"></i></span><small>${f ? `${f.percent}% · ${f.label} (estimate)` : ""}</small></div>${b.observation ? `<small class="observation">Observed: ${esc(b.observation.visual)}${b.observation.height !== null ? ` · ${num(b.observation.height)} ${esc(b.observation.heightUnit)} from base` : ""}<br>${esc(b.observation.at.slice(0, 10))}</small>` : ""}`;
}
function render() {
  const bottles = state.bottles.filter(
      (b) =>
        b.section === section && b.disposalStatus !== "archived" && !b.deleted,
    ),
    rows = selected(true);
  const title =
    view === "inventory"
      ? section === "raw"
        ? "Raw chemicals"
        : "Standardized stocks"
      : view === "log"
        ? "Withdrawal logbook"
        : view === "catalog"
          ? "Chemical registry"
          : view === "archive"
            ? "Disposal archive"
            : view === "removed"
              ? "Removed bottle records"
              : "Backups & guide";
  const locations = [
    ...new Set(
      (view === "removed"
        ? state.bottles.filter((b) => b.deleted)
        : view === "archive"
          ? state.bottles.filter(
              (b) => b.disposalStatus === "archived" && !b.deleted,
            )
          : section === "raw"
            ? stockRows(catalog, state.bottles).filter(
                (b) => b.disposalStatus !== "archived" && !b.deleted,
              )
            : bottles
      )
        .filter(
          (b) =>
            view === "archive" || view === "removed" || b.section === section,
        )
        .map((b) => b.storage)
        .filter(Boolean),
    ),
  ].sort();
  const options = (pairs, value) =>
    pairs
      .map(
        ([v, t]) =>
          `<option value="${esc(v)}" ${value === v ? "selected" : ""}>${esc(t)}</option>`,
      )
      .join("");
  app.innerHTML = `<aside class="sidebar"><a class="brand" href="#" id="brand-home"><img src="${logo}" alt="Shemberg"></a><p class="lab-name">QA Lab Chemicals Inventory</p><nav>${[
    ["raw", "Raw chemicals"],
    ["standard", "Standardized stocks"],
    ["log", "Withdrawal logbook"],
    ["catalog", "Chemical registry"],
    ["archive", "Disposal archive"],
    ["removed", "Removed records"],
    ["backup", "Backups & guide"],
  ]
    .map(
      ([n, t]) =>
        `<button data-nav="${n}" class="${(n === section && view === "inventory") || n === view ? "active" : ""}">${t}</button>`,
    )
    .join(
      "",
    )}</nav><div class="sidebar-bottom"><p class="tool-credit">Shemberg QA Lab Chemicals Inventory</p><p class="creator-credit">Created by Jermaine Theus Cahayagan<br>© ${new Date().getFullYear()} Jermaine Theus Cahayagan</p><p>Offline · saved in this browser</p></div></aside>
  <main><div class="page"><header class="page-heading"><h1>${title}</h1><div class="heading-actions">${view === "inventory" || view === "archive" || view === "removed" ? '<button class="button secondary" id="export-open">Export</button><button class="button primary" id="add-bottle">Add bottle</button>' : view === "catalog" ? '<button class="button secondary" id="repair-numbering">Fix numbering / update list</button><button class="button secondary" id="import-registry">Import list</button><button class="button primary" id="new-chemical">Add chemical</button>' : view === "log" ? '<button class="button secondary" id="export-log">Export all records</button>' : ""}</div></header>
  ${state.bottles.length && state.numberingVersion !== 2 ? '<p class="notice">Legacy registration labels detected. Chemical registry → Fix numbering / update list previews code corrections and preserves your records.</p>' : ""}${storageError ? `<div class="notice danger">${esc(storageError)} <button id="recover-data">Download stored data</button></div>` : ""}
  ${
    view === "inventory" || view === "archive" || view === "removed"
      ? `<p class="inventory-summary">${view === "archive" ? "Disposed containers · " : section === "raw" ? `${catalog.length} chemicals in registry · ` : ""}${view === "removed" ? `${rows.length} removed bottle records` : view === "archive" ? `${rows.length} archived containers` : `${bottles.length} bottles recorded · ${bottles.filter((b) => alerts(b).length).length} with alerts`}</p>
  ${section === "raw" && view !== "archive" && view !== "removed" ? '<p class="stock-help">Your existing stocks are listed below. Enter a quantity to start tracking withdrawals.</p>' : ""}
  <section class="inventory-panel">${
    section === "raw" && view !== "archive" && view !== "removed"
      ? `<div class="stock-sections" role="group" aria-label="Stock group">${[
          ["", "All chemicals"],
          ["active", "Active"],
          ["old", "Old stock"],
        ]
          .map(
            ([v, t]) =>
              `<button class="button ${stockScope === v ? "primary" : "secondary"}" data-stock-scope="${v}" aria-pressed="${stockScope === v}">${t}</button>`,
          )
          .join("")}</div>`
      : ""
  }${view === "inventory" ? `<div class="stock-sections"><button class="button ${inventoryLayout === "bottles" ? "primary" : "secondary"}" data-layout="bottles">Bottle list</button><button class="button ${inventoryLayout === "overview" ? "primary" : "secondary"}" data-layout="overview">Chemical overview</button></div>` : ""}<div class="filters"><label class="search"><input id="search-chem" aria-label="Search inventory" placeholder="Search name, CAS, internal code, lab code or bottle" value="${esc(query)}"></label><select id="storage-filter" aria-label="Filter storage"><option value="">All storage</option>${locations.map((x) => `<option ${storage === x ? "selected" : ""}>${esc(x)}</option>`).join("")}</select><select id="category-filter" aria-label="Filter chemical type">${options([["", "All types"], ...["Acids", "Bases", "Oxidizers", "Salts", "Solvents", "Indicators", "Other / unclassified"].map((x) => [x, x])], category)}</select><select id="status-filter" aria-label="Filter alerts">${options(
    [
      ["", "All statuses"],
      ["alerts", "With alerts"],
      ["low", "Low stock"],
      ["unknown", "Quantity not entered"],
      ["expired", "Expired"],
      ["due", "Standardization alerts"],
      ["disposal", "Suggested for disposal"],
      ["shelf", "Shelf-life review due"],
    ],
    status,
  )}</select><select id="sort-chem" aria-label="Sort inventory">${options(
    [
      ["name", "Name A–Z"],
      ["storage", "Storage"],
      ["classification", "Classification"],
      ["expiry", "Expiration date"],
      ["restandardDate", "Restandardization"],
      ["balance", "Balance (by unit)"],
      ["bottleId", "Bottle ID"],
    ],
    sort,
  )}</select>${query || storage || category || status ? '<button class="text-button" id="clear-filters">Reset</button>' : ""}</div>
  ${view === "inventory" && inventoryLayout === "overview" ? overviewView(rows) : rows.length ? `<div class="table-wrap"><table class="inventory-table"><thead><tr><th>Chemical${section === "standard" ? " / solution" : ""}</th><th>Quantity</th><th>${view === "archive" || view === "removed" ? "Storage / standardization" : section === "raw" ? "Storage" : "Standardization"}</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map((b) => stockRow(b)).join("")}</tbody></table></div>` : `<div class="empty"><h2>${bottles.length || section === "raw" ? "No matching stocks" : "No standardized stocks yet"}</h2><p>${bottles.length || section === "raw" ? "Change the search or filters." : "Add a solution to record its quantity and standardization dates."}</p></div>`}
  <p class="table-footer">${rows.length} entries shown</p></section>`
      : view === "catalog"
        ? catalogView()
        : view === "log"
          ? logView()
          : backupView()
  }
  </div></main><dialog id="modal" aria-labelledby="modal-title"></dialog><div id="toast" class="toast" role="status"></div><input type="file" id="restore-file" accept=".json,application/json" hidden>`;
  bind();
}
function stockRow(b) {
  return `<tr ${b.isCatalog ? 'data-default-stock="' + b.id + '"' : ""}><td>${b.isCatalog ? `<strong>${esc(b.name)}</strong>` : `<button class="chemical-name" data-detail="${b.id}">${esc(b.name)}</button>`}${b.concentration ? `<div class="concentration">${esc(b.concentration)}</div>` : ""}<div class="subline">${b.bottleId ? esc(b.bottleId) + " · " : ""}${esc(b.formula || "")}${b.cas ? " · CAS " + esc(b.cas) : ""}</div><div class="subline">${esc(b.classification || "")}</div><div class="subline">${esc(b.internalCode || "")}${b.labCode ? " · Lab " + esc(b.labCode) : ""} · ${b.stockGroup === "old" ? "Old stock" : "Active"}</div></td><td>${b.isCatalog ? '<span class="quantity-missing">Not entered</span>' : `<strong class="stock-amount">${b.deleted ? "Removed" : b.disposalStatus === "archived" ? "Disposed" : num(b.balance) + " " + (b.balance !== null ? esc(b.unit) : "")}</strong>${level(b)}${b.gross !== null && b.gross !== undefined ? `<div class="subline">Last gross weight: ${num(b.gross)} g</div>` : ""}`}</td><td>${b.section === "raw" ? `${esc(b.storage || "Not recorded")}${b.lot ? '<div class="subline">Lot ' + esc(b.lot) + "</div>" : ""}` : `Due ${fmtDate(b.restandardDate)}<div class="subline">${esc(b.analyst)}</div>`}</td><td class="badge-cell">${badges(b)}${b.expiry ? `<div class="subline">Expires ${esc(b.expiry)}</div>` : ""}</td><td><div class="row-actions">${b.isCatalog ? `<button class="button small" data-quantity="${b.id}">Enter quantity</button><button class="text-button" data-suggest-source="${b.id}">Suggest disposal</button><button class="text-button" data-stock-change="${b.id}" data-target-group="${b.stockGroup === "old" ? "active" : "old"}">Set ${b.stockGroup === "old" ? "Active" : "Old stock"}</button>` : `${!b.deleted && b.disposalStatus !== "archived" ? `<button class="button small" data-withdraw="${b.id}">Withdraw</button>` : ""}<button class="text-button" data-detail="${b.id}">Details</button>${b.deleted ? `<button class="text-button" data-remove="${b.id}" data-restore="true">Restore</button>` : `<button class="text-button" data-remove="${b.id}">Delete record</button>`}${!b.deleted && b.disposalStatus !== "archived" ? `<button class="text-button" data-disposition="${b.id}">Disposal</button>` : ""}${!b.deleted && b.disposalStatus !== "archived" ? `<button class="text-button" data-stock-change="${esc(b.isCatalog ? b.id : b.catalogId || b.id)}" data-stock-bottle="${b.isCatalog ? "" : b.id}" data-target-group="${b.stockGroup === "old" ? "active" : "old"}">Set ${b.stockGroup === "old" ? "Active" : "Old stock"}</button>` : ""}${b.catalogId && !b.deleted && b.disposalStatus !== "archived" ? `<button class="text-button" data-register="${esc(b.catalogId)}" data-template="${b.id}">Add bottle</button>` : ""}`}</div></td></tr>`;
}
function catalogView() {
  return `<div class="notice"><span>ⓘ</span><div>Add chemicals here or edit an existing entry. Shared identity edits update linked bottles; bottle quantities, lots and storage stay unchanged.</div></div><section class="inventory-panel"><div class="filters"><label class="search"><span>⌕</span><input id="catalog-search" aria-label="Search locator" placeholder="Search chemicals, CAS, storage or classification"></label></div><div class="table-wrap"><table><thead><tr><th>Chemical / formula</th><th>Classification / CAS</th><th>Storage</th><th>Source hazards</th><th></th></tr></thead><tbody id="catalog-rows">${catalogRows(catalog)}</tbody></table></div></section>`;
}
function catalogRows(items) {
  return (
    items
      .map(
        (c) =>
          `<tr><td><strong>${esc(c.name)}</strong><div class="subline">${esc(tracingDetails(c).internalCode)} · ${esc(c.formula || "Formula not recorded")}</div></td><td>${esc(c.classification || "Unclassified")}<div class="subline">${esc(c.cas || "CAS not recorded")}</div></td><td>${esc(c.storage || "Not recorded")}</td><td class="hazard-text">${esc(c.hazards || "Not recorded")}</td><td><button class="button small" data-register="${c.id}">Register bottle</button><button class="text-button" data-edit-chemical="${c.id}">Edit chemical</button><button class="text-button" data-stock-change="${c.id}" data-target-group="${tracingDetails(c).stockGroup === "old" ? "active" : "old"}">Set ${tracingDetails(c).stockGroup === "old" ? "Active" : "Old stock"}</button></td></tr>`,
      )
      .join("") || '<tr><td colspan="5">No matching catalog entries.</td></tr>'
  );
}
function logView() {
  return `<section class="inventory-panel"><div class="panel-header"><h2>All stock movements <span>${state.events.length}</span></h2><span class="quiet">Local audit history · newest first</span></div><div class="filters"><label class="search"><span>⌕</span><input id="log-search" aria-label="Search logbook" value="${esc(logQuery)}" placeholder="Search bottle, analyst, action, or purpose…"></label><select id="log-action" aria-label="Filter logbook action"><option value="">All actions</option>${["Withdrawal", "Physical inventory", "Restandardization", "Visual observation", "Details corrected", "Registered", "Chemical registry updated", "Suggested for disposal", "Disposal suggestion cleared", "Disposed", "Bottle removed", "Bottle restored"].map((t) => `<option>${t}</option>`).join("")}</select></div><div id="log-table">${eventTable(state.events.filter((e) => JSON.stringify(e).toLowerCase().includes(logQuery.toLowerCase())))}</div></section>`;
}
function eventTable(events) {
  return events.length
    ? `<div class="table-wrap"><table class="log-table"><thead><tr><th>Recorded / bottle</th><th>Action</th><th>Stock balance</th><th>Analyst / purpose</th></tr></thead><tbody>${events
        .toReversed()
        .map(
          (e) =>
            `<tr><td>${esc(new Date(e.at).toLocaleString())}<div class="subline">${esc(e.bottleId)} · ${esc(e.name)}</div></td><td><span class="badge ${e.type === "Withdrawal" ? "warn" : "good"}">${esc(e.type)}</span>${e.enteredAmount !== undefined ? `<div class="subline">${num(e.enteredAmount)} ${esc(e.enteredUnit)} withdrawn</div>` : ""}</td><td><strong>${num(e.before)} → ${num(e.after)}</strong><div class="subline">${esc(e.unit)}${e.quantity !== undefined && e.quantity !== null ? ` · ${e.type === "Withdrawal" ? "withdrawal" : "change"} ${num(e.quantity)} ${esc(e.quantityUnit || e.unit)}` : ""}</div></td><td><strong>${esc(e.analyst)}</strong><div class="subline">${esc(e.reason)}</div>${e.standard ? `<div class="subline">${esc(e.standard.concentration)} · next ${esc(e.standard.restandardDate)}</div>` : ""}${e.measurement?.method === "before-after gross weight" ? `<div class="subline">Bottle weights: ${num(e.measurement.before)} → ${num(e.measurement.after)} g (gross)</div>` : e.measurement ? `<div class="subline">${esc(e.measurement.method)}: ${esc(e.measurement.amount)} ${e.measurement.method === "volume" ? "mL" : "g"}; tare ${esc(e.measurement.tare ?? "not supplied")}</div>` : ""}${e.observation ? `<div class="subline">Observed ${esc(e.observation.visual)} · ${num(e.observation.height)} ${esc(e.observation.heightUnit)}</div>` : ""}</td></tr>`,
        )
        .join("")}</tbody></table></div>`
    : '<div class="empty compact"><h3>No log entries yet</h3><p>Register a bottle to begin its history.</p></div>';
}
function backupView() {
  return `<div class="guide-grid"><section class="guide-card"><h2>Backup and restore</h2><p>Before replacing this HTML with an update, download a JSON backup. Keep the same file name, location and browser profile. If your records are not visible in the updated file, restore that backup.</p><p>Download a JSON backup after each lab session. It saves quantities, bottle details and the complete logbook. Excel, Word, PDF and CSV are reports, not restorable backups.</p><div class="button-group"><button class="button primary" id="backup-download">Download backup</button><button class="button secondary" id="backup-restore">Restore backup</button></div><p class="quiet">${state.bottles.length} bottles recorded · ${state.events.length} log entries</p><p>Data is stored in this browser. Keep the same browser profile and HTML file location; back up before moving the file or clearing browser data.</p></section><section class="guide-card"><h2>Registry, disposal and exports</h2><p>Use Chemical registry to add a chemical or edit its shared identity. Bottle quantities, lots and storage stay unchanged; edits are logged.</p><p>Use Disposal on a bottle to suggest it for disposal. Confirm disposal only after the entire container has been disposed; its record moves to Disposal archive with the prior quantity and history retained. Unmeasured stock has a Suggest disposal action.</p><p>Use Export → Chemical category for acids, bases, salts, solvents and other groups. Current search, storage and stock-group filters still apply. Export from the archive for disposed records.</p></section><section class="guide-card"><h2>Import, overview and reports</h2><p>Chemical registry → Import list accepts CSV or Excel, shows duplicate checks and proposed codes, and saves only selected additions. Numbering is based on the records loaded in this browser; restore your latest backup before importing into a new file.</p><p>Chemical overview counts recorded bottles and shows separate known gram and milliliter totals. View bottles lists the contributing containers and flags.</p><p>Create report lets you choose inventory, overview or activity log, individual rows, and inventory columns. Reports are for reading; JSON remains the full restorable backup.</p><p>Delete record removes mistaken input from working stock without changing its stored quantity. Removed records lets you restore it with a reason. Disposal remains a separate action.</p><p>Shelf-life review defaults to 24 months when expiration is missing. Set manufacture/receipt dates and optional after-opening months in Shelf-life review settings. Review flags do not replace label/SDS guidance or establish expiry.</p></section><section class="guide-card"><h2>Measurements</h2><p>Net mass = gross bottle weight − empty container weight. Without a known tare, net stock remains unknown. Use Withdraw → Before / after bottle weights to log grams removed and keep the latest gross reading.</p><p>1 cm³ = 1 mL. Converting between grams and milliliters requires the chemical’s verified density in g/mL: volume = mass ÷ density.</p><p>Full, ¾, ½, ¼ and Empty are visual estimates. Liquid height in cm or inches can be logged separately. Neither observation changes the measured balance.</p></section><details class="form-details"><summary>Stock corrections and source information</summary><p>Use Physical inventory to enter a new measured balance with a reason. Previous balances remain in the logbook. Use Correct details for metadata changes and Add bottle for a different lot or container.</p><p>The 136 default stocks retain the information from your locator, including repeated names in different source rows. No quantities, densities or purity values are assumed. Source hazards and locations should be verified against labels and SDS.</p><p>This local app has no shared accounts, electronic signatures or tamper-proof audit trail. Blank dates and minimum levels mean not recorded.</p></details></div>`;
}
function bind() {
  document.querySelectorAll("[data-nav]").forEach(
    (el) =>
      (el.onclick = () => {
        const n = el.dataset.nav;
        if (["raw", "standard"].includes(n)) {
          section = n;
          view = "inventory";
          query = storage = category = status = "";
        } else {
          view = n;
          if (n === "archive" || n === "removed")
            query = storage = category = status = "";
        }
        render();
      }),
  );
  document.querySelectorAll("[data-stock-scope]").forEach(
    (e) =>
      (e.onclick = () => {
        stockScope = e.dataset.stockScope;
        render();
      }),
  );
  const on = (id, event, fn) => {
    const e = document.getElementById(id);
    if (e) e.addEventListener(event, fn);
  };
  on("brand-home", "click", (e) => {
    e.preventDefault();
    section = "raw";
    view = "inventory";
    query = storage = category = status = "";
    render();
  });
  on("new-chemical", "click", () => chemicalForm());
  on("repair-numbering", "click", () => repairForm());
  on("import-registry", "click", () => registryImportForm());
  document.querySelectorAll("[data-layout]").forEach(
    (e) =>
      (e.onclick = () => {
        inventoryLayout = e.dataset.layout;
        render();
      }),
  );
  document
    .querySelectorAll("[data-overview]")
    .forEach(
      (e) =>
        (e.onclick = () =>
          overviewDetails(Number(e.dataset.overview), selected(true))),
    );
  document
    .querySelectorAll("[data-remove]")
    .forEach(
      (e) =>
        (e.onclick = () =>
          removalForm(e.dataset.remove, e.dataset.restore === "true")),
    );
  if (view === "archive" || view === "removed")
    document.querySelector("#add-bottle")?.remove();
  bindChemicalActions();
  on("add-bottle", "click", () => bottleForm());
  on("empty-add", "click", () => {
    if (state.bottles.some((b) => b.section === section)) {
      query = storage = category = status = "";
      render();
    } else bottleForm();
  });
  on("browse-catalog", "click", () => {
    view = "catalog";
    render();
  });
  on("guide-link", "click", (e) => {
    e.preventDefault();
    view = "backup";
    render();
  });
  for (const [id, set] of [
    ["search-chem", (v) => (query = v)],
    ["storage-filter", (v) => (storage = v)],
    ["category-filter", (v) => (category = v)],
    ["status-filter", (v) => (status = v)],
    ["sort-chem", (v) => (sort = v)],
  ])
    on(id, id === "search-chem" ? "input" : "change", (e) => {
      const p = e.target.selectionStart;
      set(e.target.value);
      render();
      if (id === "search-chem") {
        const input = document.getElementById(id);
        input.focus();
        input.setSelectionRange(p, p);
      }
    });
  on("clear-filters", "click", () => {
    query = storage = category = status = "";
    render();
  });
  document
    .querySelectorAll("[data-detail]")
    .forEach((e) => (e.onclick = () => detail(e.dataset.detail)));
  document
    .querySelectorAll("[data-withdraw]")
    .forEach(
      (e) =>
        (e.onclick = () => transactionForm(e.dataset.withdraw, "Withdrawal")),
    );
  document
    .querySelectorAll("[data-quantity]")
    .forEach(
      (e) =>
        (e.onclick = () =>
          quantityForm(catalog.find((c) => c.id === e.dataset.quantity))),
    );
  const bindRegister = () =>
    document.querySelectorAll("[data-register]").forEach(
      (e) =>
        (e.onclick = () => {
          section = "raw";
          bottleForm(
            catalog.find((c) => c.id === e.dataset.register),
            null,
            e.dataset.template,
          );
        }),
    );
  bindRegister();
  on("catalog-search", "input", (e) => {
    const q = e.target.value.toLowerCase();
    document.getElementById("catalog-rows").innerHTML = catalogRows(
      catalog.filter((c) =>
        Object.values(c).join(" ").toLowerCase().includes(q),
      ),
    );
    bindRegister();
    bindChemicalActions();
  });
  const logFilter = () => {
    const q = document.getElementById("log-search").value.toLowerCase(),
      type = document.getElementById("log-action").value;
    logQuery = q;
    document.getElementById("log-table").innerHTML = eventTable(
      state.events.filter(
        (e) =>
          (!type || e.type === type) &&
          JSON.stringify(e).toLowerCase().includes(q),
      ),
    );
  };
  on("log-search", "input", logFilter);
  on("log-action", "change", logFilter);
  on("export-open", "click", () =>
    exportDialog(selected(true, true), category),
  );
  on("export-log", "click", () =>
    exportDialog(stockRows(catalog, state.bottles).filter((b) => !b.deleted)),
  );
  on("backup-download", "click", () =>
    download(
      new Blob(
        [
          JSON.stringify(
            { ...state, exportedAt: new Date().toISOString() },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
      "Shemberg-Chemicals-backup-" + today() + ".json",
    ),
  );
  on("backup-restore", "click", () =>
    document.querySelector("#restore-file").click(),
  );
  on("restore-file", "change", async (e) => {
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 30 * 1024 * 1024)
        throw new Error("Backup exceeds the 30 MB limit.");
      const parsed = validateBackup(JSON.parse(await file.text()));
      pendingRestore = upgradeState(
        parsed,
        chemicalRegistry(sourceCatalog, parsed),
      );
      showModal(
        "Restore workspace",
        `<p>This backup contains <strong>${pendingRestore.bottles.length} bottles and ${pendingRestore.events.length} log entries</strong>.</p><div class="notice danger">Restoring replaces all current chemicals records in this browser. Download a current backup first. This cannot be undone inside the app.</div><label class="check"><input type="checkbox" id="confirm-restore"> I have backed up my current records and want to replace this workspace.</label><div class="dialog-actions"><button class="button secondary" data-close>Cancel</button><button class="button primary" id="do-restore">Replace workspace</button></div>`,
      );
      document.querySelector("#do-restore").onclick = () => {
        if (!document.querySelector("#confirm-restore").checked) {
          dialogError("Confirm replacement before restoring.");
          return;
        }
        try {
          localStorage.setItem(KEY, JSON.stringify(pendingRestore));
          state = pendingRestore;
          catalog = chemicalRegistry(sourceCatalog, state);
          pendingRestore = null;
          storageError = "";
          render();
          toast("Workspace restored.");
        } catch (err) {
          dialogError(err.message);
        }
      };
    } catch (err) {
      toast(err.message, true);
    }
    e.target.value = "";
  });
  on("recover-data", "click", () =>
    download(
      new Blob([localStorage.getItem(KEY) || ""], { type: "application/json" }),
      "Shemberg-stored-data-recovery.json",
    ),
  );
}
function showModal(title, body) {
  const d = document.querySelector("#modal");
  d.innerHTML = `<div class="dialog-heading"><div><h2 id="modal-title">${esc(title)}</h2></div><button class="close-button" aria-label="Close dialog" data-close>×</button></div><div class="dialog-body">${body}<div id="dialog-error" class="form-error" role="alert"></div></div>`;
  d.querySelectorAll("[data-close]").forEach(
    (e) => (e.onclick = () => d.close()),
  );
  attachSuggestions(d, title);
  d.showModal();
}
function attachSuggestions(dialog, context) {
  const suggestions = savedSuggestions(state, catalog, context);
  const lists = new Map();
  dialog.querySelectorAll('input[name][type="text"]').forEach((input) => {
    // Preserve the chemical picker, which also fills related source fields.
    if (input.hasAttribute("list")) return;
    const entries = suggestions[input.name];
    if (!entries?.length) return;
    let list = lists.get(input.name);
    if (!list) {
      list = document.createElement("datalist");
      list.id = "previous-" + input.name;
      for (const value of entries) {
        const option = document.createElement("option");
        option.value = value;
        list.append(option);
      }
      dialog.append(list);
      lists.set(input.name, list);
    }
    input.setAttribute("list", list.id);
    input.setAttribute("autocomplete", "off");
  });
}
function dialogError(msg) {
  document.querySelector("#dialog-error").textContent = msg;
  document.querySelector("#dialog-error").scrollIntoView({ block: "nearest" });
}
const field = (
  name,
  label,
  value = "",
  type = "text",
  required = false,
  help = "",
) =>
  `<label class="field"><span>${label}${required ? " <b>*</b>" : ""}</span><input name="${name}" type="${type}" value="${esc(value)}" ${required ? "required" : ""} ${type === "number" ? 'min="0" step="any"' : ""}>${help ? `<small>${help}</small>` : ""}</label>`;
const select = (name, label, options, value) =>
  `<label class="field"><span>${label}</span><select name="${name}">${options
    .map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${v === value ? "selected" : ""}>${esc(t)}</option>`;
    })
    .join("")}</select></label>`;
const measurementFields = (b) =>
  `<div class="form-section"><h3>Physical measurement</h3><p class="quiet">Use a measured net quantity, or weigh gross with an optional known tare. Unknown tare saves gross only; no available stock is assumed.</p><div class="form-grid">${select(
    "method",
    "Measurement method",
    [
      ["mass", "Net mass (g)"],
      ["volume", "Measured volume (mL)"],
      ["gross", "Gross bottle weight (g)"],
    ],
    b?.unit === "mL" ? "volume" : "mass",
  )}${field("amount", "Measured amount", "", "number", true)}${field("tare", "Empty container tare (g)", b?.tare ?? "", "number", false, "Optional for gross weighing; include the same cap/container configuration.")}</div></div>`;
function traceFields(b = {}) {
  const details = tracingDetails(b, catalog);
  return `${select(
    "stockGroup",
    "Stock group",
    [
      ["active", "Active"],
      ["old", "Old stock"],
    ],
    details.stockGroup,
  )}${field("internalCode", "Internal chemical code", details.internalCode === "BOTTLE-undefined" ? "" : stockCode(details.internalCode, details.stockGroup), "text", false, "Kept separately from the bottle ID; blank generates a stable code.")}${field("labCode", "Lab code", details.labCode)}${field("formulaWeight", "Formula weight (g/mol)", details.formulaWeight ?? "", "number", false, "Use the verified label/SDS value, including hydration state.")}${field("opened", "Date opened", details.opened, "date")}${field("openedBy", "Opened by", details.openedBy)}${shelfFields(b)}`;
}
function shelfFields(b = {}) {
  return `<details class="form-details"><summary>Shelf-life review settings</summary><p class="quiet">Manufacturer expiration takes priority. Without it, review defaults to 24 months from manufacture date, or date received when manufacture is unknown. This is a review flag, not proof of expiry.</p><div class="form-grid">${field("manufactured", "Manufacture date", b.manufactured || "", "date")}${field("shelfLifeMonths", "Unopened / age review (months)", b.shelfLifeMonths ?? 24, "number", false, "0 disables this estimate.")}${field("openedLifeMonths", "Review after opening (months)", b.openedLifeMonths ?? "", "number", false, "Optional chemical-specific period from date opened.")}</div></details>`;
}
function densityFields(b = {}) {
  return `<div class="density-input">${field("density", "Verified density (g/mL)", b.density ?? "", "number", false, "For liquid mass/volume conversion.")}</div><div class="density-input">${field("densityTemp", "Density temperature (°C)", b.densityTemp ?? "", "number", false, "Temperature at which this density applies.").replace('min="0"', 'min="-273.15"')}</div>`;
}
function bindPhase(form) {
  const update = () => {
    const solid = form.elements.phase?.value === "Solid";
    form.querySelectorAll(".density-input").forEach((e) => {
      e.hidden = solid;
      e.querySelectorAll("input").forEach((x) => (x.disabled = solid));
    });
    if (solid && form.elements.unit) {
      form.elements.unit.value = "g";
    }
    if (form.elements.unit)
      Array.from(form.elements.unit.options).forEach(
        (o) => (o.disabled = solid && o.value === "mL"),
      );
    if (form.elements.method) {
      const option = form.elements.method.querySelector(
        'option[value="volume"]',
      );
      if (option) option.disabled = solid;
      if (solid && form.elements.method.value === "volume")
        form.elements.method.value = "mass";
    }
  };
  if (form.elements.phase) form.elements.phase.onchange = update;
  update();
}
function bindChemicalActions() {
  document
    .querySelectorAll("[data-stock-change]")
    .forEach(
      (e) =>
        (e.onclick = () =>
          groupForm(
            e.dataset.stockChange,
            e.dataset.targetGroup,
            e.dataset.stockBottle,
          )),
    );
  document
    .querySelectorAll("[data-edit-chemical]")
    .forEach((e) => (e.onclick = () => chemicalForm(e.dataset.editChemical)));
  document
    .querySelectorAll("[data-disposition]")
    .forEach((e) => (e.onclick = () => dispositionForm(e.dataset.disposition)));
  document
    .querySelectorAll("[data-suggest-source]")
    .forEach(
      (e) => (e.onclick = () => dispositionForm(e.dataset.suggestSource, true)),
    );
}
function chemicalForm(key = null) {
  const c = key ? catalog.find((x) => x.id === key) : {};
  const history = (state.registryEvents || []).filter(
    (e) => e.chemicalId === key,
  );
  showModal(
    key ? "Edit chemical" : "Add chemical",
    `<form id="chemical-form"><div class="form-grid">${field("internalCode", "Chemical code", c.internalCode || (key ? tracingDetails(c).internalCode : nextChemicalCode(state, sourceCatalog, codeBasis(state, sourceCatalog))), "text", true, "Suggested from the latest codes in this browser; existing codes are unchanged.")}${field("name", "Chemical name", c.name || "", "text", true)}${field("formula", "Molecular formula", c.formula || "")}${field("cas", "CAS number", c.cas || "")}${field("classification", "Classification / category", c.classification || "", "text", false, "For example: organic acid, base, inorganic salt, solvent or indicator.")}${field("storage", "Default storage", c.storage || "")}${field("hazards", "Hazards (verified reference)", c.hazards || "")}${field("formulaWeight", "Formula weight (g/mol)", c.formulaWeight ?? "", "number")}${select(
      "stockGroup",
      "Default stock group",
      [
        ["active", "Active"],
        ["old", "Old stock"],
      ],
      tracingDetails(c).stockGroup,
    )}${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Reason / source reference", "", "text", true)}</div><p class="quiet">Edits update shared chemical identity on linked, non-archived bottles. Bottle IDs, quantities, lots, dates and storage are preserved.</p><div class="dialog-actions"><button class="button secondary" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save chemical</button></div></form>${
      history.length
        ? `<details class="form-details"><summary>Registry edit history</summary>${history
            .toReversed()
            .map(
              (e) =>
                `<p>${esc(e.at)} · ${esc(e.analyst)} · ${esc(e.reason)}</p>`,
            )
            .join("")}</details>`
        : ""
    }`,
  );
  const chemicalFormElement = document.querySelector("#chemical-form");
  chemicalFormElement.elements.stockGroup.addEventListener(
    "change",
    () =>
      (chemicalFormElement.elements.internalCode.value = stockCode(
        chemicalFormElement.elements.internalCode.value,
        chemicalFormElement.elements.stockGroup.value,
      )),
  );
  document.querySelector("#chemical-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      commit(
        saveChemical(
          state,
          sourceCatalog,
          Object.fromEntries(new FormData(e.target)),
          key,
        ),
      );
      toast("Chemical registry saved.");
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function dispositionForm(key, sourceOnly = false) {
  const b = sourceOnly
    ? catalog.find((c) => c.id === key)
    : state.bottles.find((b) => b.id === key);
  showModal(
    "Disposal record",
    `<form id="disposal-form"><p><strong>${esc(b.name)}</strong>${b.bottleId ? " · " + esc(b.bottleId) : ""}</p>${sourceOnly ? '<p class="quiet">This creates a bottle record with unknown quantity for disposal review.</p>' : ""}${select(
      "status",
      "Action",
      sourceOnly
        ? [["suggested", "Suggest for disposal"]]
        : [
            ["suggested", "Suggest for disposal"],
            ["normal", "Clear disposal suggestion"],
            ["archived", "Confirm disposal and archive"],
          ],
      b.disposalStatus === "suggested" ? "archived" : "suggested",
    )}<div class="form-grid">${sourceOnly ? field("bottleId", "Bottle / container ID", "", "text", true) : ""}${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Reason / disposal details", "", "text", true)}${field("reference", "Disposal reference / receipt (optional)")}</div><label class="check" id="confirm-disposal-label"><input type="checkbox" name="confirm">I confirm this entire container has been disposed. Archive its record and remove it from usable stock.</label><div class="dialog-actions"><button class="button secondary" type="button" data-close>Cancel</button><button class="button primary" type="submit">Save disposal record</button></div></form>`,
  );
  const form = document.querySelector("#disposal-form");
  const sync = () => {
    document.querySelector("#confirm-disposal-label").hidden =
      form.elements.status.value !== "archived";
  };
  form.elements.status.onchange = sync;
  sync();
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const input = Object.fromEntries(new FormData(form));
      let next = state,
        bottleKey = key;
      if (sourceOnly) {
        next = register(
          state,
          {
            ...b,
            catalogId: b.id,
            section: "raw",
            bottleId: input.bottleId,
            unit: "g",
            analyst: input.analyst,
          },
          { method: "unmeasured" },
        );
        bottleKey = next.bottles.at(-1).id;
      }
      commit(setDisposition(next, bottleKey, input, sourceCatalog));
      toast(
        input.status === "archived"
          ? "Disposed stock moved to archive."
          : "Disposal record saved.",
      );
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function overviewView(rows) {
  const groups = chemicalOverview(rows);
  return `<p class="quiet">Counts of recorded bottles and known balances for this view. Unmeasured list entries do not establish a bottle count. Grams and milliliters stay separate; unknown quantities and review flags remain visible. Concentrations, formulas and grades are not combined.</p><div class="table-wrap"><table class="overview-table"><thead><tr><th>Chemical / solution</th><th>Bottles recorded</th><th>Known balances</th><th>Unknown bottle quantities</th><th>Storage</th><th>Trace</th></tr></thead><tbody>${groups.map((g, i) => `<tr><td>${esc(g.name)}${g.concentration ? "<div>" + esc(g.concentration) + "</div>" : ""}${g.purity ? "<div>" + esc(g.purity) + "</div>" : ""}<div class="subline">${esc(g.codes.join(", "))}</div></td><td>${g.bottles}${g.suggested ? '<div class="subline">' + g.suggested + " suggested for disposal</div>" : ""}</td><td>${[g.hasGrams ? num(g.grams) + " g" : "", g.hasMilliliters ? num(g.milliliters) + " mL" : ""].filter(Boolean).join("; ") || "Not entered"}</td><td>${g.unknown}</td><td>${esc(g.storages.join("; "))}</td><td><button class="text-button" data-overview="${i}">View bottles</button></td></tr>`).join("")}</tbody></table></div>`;
}
function overviewDetails(index, rows) {
  const g = chemicalOverview(rows)[index];
  showModal(
    g.name,
    `<p>${g.bottles} recorded bottles · ${g.unknown} unknown quantities</p><div class="table-wrap"><table><thead><tr><th>Bottle ID</th><th>Quantity</th><th>Storage / lot</th><th>Flags</th></tr></thead><tbody>${g.rows.map((b) => `<tr><td>${esc(b.bottleId || "Not recorded")}</td><td>${b.balance === null ? "Not entered" : num(b.balance) + " " + esc(b.unit)}</td><td>${esc(b.storage || "")} · ${esc(b.lot || "")}</td><td>${esc(b.isCatalog ? "Quantity not entered" : alerts(b).join("; "))}</td></tr>`).join("")}</tbody></table></div>`,
  );
}
function removalForm(key, restore = false) {
  const b = state.bottles.find((x) => x.id === key);
  showModal(
    restore ? "Restore bottle record" : "Delete bottle record",
    `<form id="removal-form"><p><strong>${esc(b.bottleId)} · ${esc(b.name)}</strong></p><p>${restore ? "Return this record to its previous inventory or disposal status." : "Remove a duplicate or mistaken record from working inventory and reports. It remains recoverable under Removed records; original quantities and history are retained. This does not record a chemical disposal."}</p><div class="form-grid">${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Reason", "", "text", true)}</div>${restore ? "" : '<label class="check"><input type="checkbox" name="confirm">Remove this bottle record</label>'}<div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">${restore ? "Restore record" : "Delete record"}</button></div></form>`,
  );
  document.querySelector("#removal-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      commit(
        removeBottle(
          state,
          key,
          Object.fromEntries(new FormData(e.target)),
          restore,
          sourceCatalog,
        ),
      );
      toast(
        restore
          ? "Bottle record restored."
          : "Bottle record moved to Removed records.",
      );
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function registryImportForm() {
  const basis = codeBasis(state, sourceCatalog);
  let preview = [];
  showModal(
    "Import chemical registry",
    `<p>CSV or .xlsx, first worksheet, headers in the first row. Additions only; existing entries are not overwritten. Codes are generated from the records loaded in this browser, including previous codes.</p><button class="text-button" id="registry-template">Download CSV template</button><form id="registry-import-form"><label class="field"><span>Registry file</span><input type="file" id="registry-import-file" accept=".csv,.xlsx" required></label><div class="form-grid">${field("prefix", "Code prefix (optional)", basis.prefix, "text", false)}${field("padding", "Number digits", basis.padding, "number", true)}${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Import reference", "", "text", true)}</div><p id="next-code">Next code: ${esc(nextChemicalCode(state, sourceCatalog, basis))}</p><button class="button secondary" type="button" id="preview-registry">Preview import</button><div id="registry-import-preview"></div><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit" id="apply-registry-import" disabled>Import selected chemicals</button></div></form>`,
  );
  const form = document.querySelector("#registry-import-form"),
    getBasis = () => ({
      prefix: form.elements.prefix.value,
      padding: Number(form.elements.padding.value),
    });
  document.querySelector("#registry-template").onclick = () =>
    download(
      new Blob([registryTemplate], { type: "text/csv" }),
      "Chemical-registry-template.csv",
    );
  for (const name of ["prefix", "padding"])
    form.elements[name].oninput = () => {
      preview = [];
      document.querySelector("#registry-import-preview").innerHTML = "";
      document.querySelector("#apply-registry-import").disabled = true;
      try {
        document.querySelector("#next-code").textContent =
          "Next code: " + nextChemicalCode(state, sourceCatalog, getBasis());
      } catch (err) {
        document.querySelector("#next-code").textContent = err.message;
      }
    };
  document.querySelector("#preview-registry").onclick = async () => {
    try {
      const file = document.querySelector("#registry-import-file").files[0];
      if (!file) throw new Error("Choose a CSV or .xlsx file.");
      preview = previewRegistryImport(
        await readRegistryFile(file),
        state,
        sourceCatalog,
        getBasis(),
      );
      document.querySelector("#registry-import-preview").innerHTML =
        `<p>${preview.filter((r) => !r.duplicate).length} new entries · ${preview.filter((r) => r.duplicate).length} exact duplicates skipped. File codes are ignored; auto numbering is shown below. Unchecked rows can leave number gaps.</p><div class="table-wrap"><table><thead><tr><th>Import</th><th>Row</th><th>New code</th><th>Chemical</th><th>Storage</th></tr></thead><tbody>${preview.map((r, i) => `<tr><td><input type="checkbox" data-import-row="${i}" ${r.duplicate ? "disabled" : "checked"} aria-label="Import row ${r.line}"></td><td>${r.line}</td><td>${esc(r.code || "Existing duplicate")}</td><td>${esc(r.input.name)}</td><td>${esc(r.input.storage || "")}</td></tr>`).join("")}</tbody></table></div>`;
      document.querySelector("#apply-registry-import").disabled = !preview.some(
        (r) => !r.duplicate,
      );
      document.querySelector("#dialog-error").textContent = "";
    } catch (err) {
      preview = [];
      document.querySelector("#registry-import-preview").innerHTML = "";
      document.querySelector("#apply-registry-import").disabled = true;
      dialogError(err.message);
    }
  };
  document.querySelector("#registry-import-file").onchange = () => {
    preview = [];
    document.querySelector("#registry-import-preview").innerHTML = "";
    document.querySelector("#apply-registry-import").disabled = true;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const selected = new Set(
        [...form.querySelectorAll("[data-import-row]:checked")].map((e) =>
          Number(e.dataset.importRow),
        ),
      );
      commit(
        applyRegistryImport(preview, selected, state, sourceCatalog, {
          analyst: form.elements.analyst.value,
          reason: form.elements.reason.value,
          basis: getBasis(),
        }),
      );
      toast("Selected chemicals added to registry.");
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function groupForm(key, target, bottleKey = null) {
  const prepared = repairRegistration(state, sourceCatalog);
  if (bottleKey)
    key = prepared.bottles.find((b) => b.id === bottleKey)?.catalogId || key;
  const c =
    chemicalRegistry(sourceCatalog, prepared).find((c) => c.id === key) ||
    chemicalRegistry(sourceCatalog, prepared).find(
      (c) => c.legacyBottleKey === key,
    );
  if (!c) {
    toast("Open Chemical registry to set the chemical group.", true);
    return;
  }
  showModal(
    target === "old" ? "Set chemical as Old stock" : "Set chemical as Active",
    `<form id="group-form"><p><strong>${esc(c.name)}</strong></p><p>Update the registry default and all non-archived bottles of this chemical. The numeric chemical reference, balances and history stay intact; the OLD STOCK code prefix follows the selected group.</p><div class="form-grid">${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Reason", "", "text", true)}</div><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">Set ${target === "old" ? "Old stock" : "Active"}</button></div></form>`,
  );
  document.querySelector("#group-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      commit(
        changeChemicalGroup(
          prepared,
          sourceCatalog,
          c.id,
          target,
          Object.fromEntries(new FormData(e.target)),
        ),
      );
      toast("Chemical stock group updated.");
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function repairForm() {
  const preview = updateInventoryBackup(state, sourceCatalog, supplement);
  const changed = preview.bottles.filter((b) => {
    const old = state.bottles.find((x) => x.id === b.id);
    return (
      old.bottleId !== b.bottleId ||
      old.internalCode !== b.internalCode ||
      old.catalogId !== b.catalogId
    );
  });
  const added = (preview.registry || []).filter(
    (c) =>
      !(state.registry || []).some((r) => r.id === c.id) &&
      c.id.startsWith("inventory-2026-11"),
  );
  showModal(
    "Fix numbering / update registry",
    `<form id="repair-form"><p>${state.bottles.length} bottles retained · ${state.events.length} existing log entries retained · ${changed.length} labels/links corrected · ${added.length} missing registry definitions added.</p><p>No quantities, supplier/lot details, dates or past logs are replaced. Same-name CAS conflicts in the spreadsheet are kept for separate review, not used to overwrite your main backup.</p><div class="table-wrap"><table><thead><tr><th>Chemical</th><th>Previous bottle / code</th><th>Updated bottle / code</th></tr></thead><tbody>${changed
      .map((b) => {
        const old = state.bottles.find((x) => x.id === b.id);
        return `<tr><td>${esc(b.name)}</td><td>${esc(old.bottleId)}<br>${esc(old.internalCode || "")}</td><td>${esc(b.bottleId)}<br>${esc(b.internalCode)}</td></tr>`;
      })
      .join(
        "",
      )}</tbody></table></div><div class="form-grid">${field("analyst", "Recorded by", "", "text", true)}${field("reason", "Reference / reason", "Registration numbering and November inventory reconciliation", "text", true)}</div><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">Apply corrections and additions</button></div></form>`,
  );
  document.querySelector("#repair-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      commit(
        updateInventoryBackup(
          state,
          sourceCatalog,
          supplement,
          Object.fromEntries(new FormData(e.target)),
        ),
      );
      toast(
        "Numbering corrected. Download a JSON backup to save this updated copy.",
      );
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function quantityForm(source) {
  const proposed = nextBottleDetails(state, source);
  const bottleId = proposed.bottleId;
  showModal(
    "Enter quantity",
    `<form id="quantity-form"><p class="quantity-chemical"><strong>${esc(source.name)}</strong><br>${esc(source.formula)} · ${esc(source.cas)}<br>${esc(source.storage || "Storage not recorded")}</p><div class="form-grid">${select(
      "unit",
      "Stock unit",
      [
        ["g", "g — mass"],
        ["mL", "mL — volume"],
      ],
      "g",
    )}${select(
      "method",
      "Measurement",
      [
        ["mass", "Net mass (g)"],
        ["volume", "Measured volume (mL)"],
        ["gross", "Gross weight (g)"],
      ],
      "mass",
    )}${select("phase", "Physical state", ["Not recorded", "Solid", "Liquid", "Other"], "Not recorded")}${field("amount", "Quantity", "", "number", true)}${field("analyst", "Recorded by", "", "text", true)}</div><details class="form-details"><summary>Container, lot and stock settings</summary><div class="form-grid">${field("bottleId", "Bottle ID", bottleId, "text", true)}${traceFields(source)}${field("tare", "Empty container weight (g)", "", "number")}${densityFields()}${field("lot", "Batch / lot number")}${field("supplier", "Supplier")}${field("received", "Date received", "", "date")}${field("expiry", "Expiration date", "", "date")}${field("minimum", "Minimum stock (in stock unit)", "", "number")}${field("capacity", "Full reference amount (in stock unit)", "", "number")}</div></details><p class="quiet">Gross weight needs a container tare to establish net stock.</p><div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button type="submit" class="button primary">Save quantity</button></div></form>`,
  );
  const form = document.querySelector("#quantity-form");
  form.elements.bottleId.readOnly = true;
  form.elements.internalCode.readOnly = true;
  form.elements.stockGroup.addEventListener(
    "change",
    () =>
      (form.elements.internalCode.value = stockCode(
        proposed.internalCode,
        form.elements.stockGroup.value,
      )),
  );
  bindPhase(form);
  form.elements.unit.onchange = () => {
    form.elements.method.value =
      form.elements.unit.value === "mL" ? "volume" : "mass";
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const input = {
        ...source,
        ...proposed,
        autoNumbering: true,
        ...Object.fromEntries(new FormData(form)),
        catalogId: source.id,
        section: "raw",
      };
      commit(register(state, input, input, sourceCatalog));
      toast("Quantity saved.");
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function bottleForm(source = null, existing = null, templateKey = null) {
  const copied =
    source && !existing ? bottleTemplate(state, source, templateKey) : null;
  const generated =
    state.numberingVersion >= 2 && !source && !existing && section === "raw"
      ? {
          ...nextBottleDetails(state, {
            id: "pending",
            internalCode: nextChemicalCode(state, sourceCatalog, {
              prefix: "CHEM-",
              padding: 3,
            }),
            stockGroup: "active",
          }),
          autoNumbering: true,
        }
      : null;
  const b = existing || copied?.draft || source || generated || {},
    editing = !!existing,
    isStandard = (existing?.section || section) === "standard";
  showModal(
    editing
      ? "Correct bottle details"
      : isStandard
        ? "Register standardized stock"
        : "Register raw chemical bottle",
    `<form id="bottle-form">${copied?.previous ? `<p class="notice">Details copied from ${esc(copied.previous.bottleId)}. Review lot, supplier and dates. Quantity, opening details and container tare are blank for the new bottle.</p>` : ""}${!editing && !isStandard ? `<label class="field catalog-picker"><span>Choose from your locator (or enter a custom chemical)</span><input id="choose-catalog" list="chemical-options" placeholder="Type a chemical name" autocomplete="off"><datalist id="chemical-options">${catalog.map((c) => `<option value="${esc(c.name + " — " + (c.storage || "No storage") + " [" + tracingDetails(c).internalCode + "]")}"></option>`).join("")}</datalist></label>` : ""}<div class="form-grid">${field("bottleId", "Unique bottle ID", b.bottleId || "", "text", true)}${traceFields(b)}${field("name", isStandard ? "Solution name" : "Chemical name", b.name || "", "text", true)}${isStandard ? field("concentration", "Verified concentration", b.concentration || "", "text", true, "Include units, e.g. 0.1002 mol/L or 0.1 N.") : ""}${field("purity", "Purity / grade (as labeled)", b.purity || "")}${select("phase", "Physical state", ["Not recorded", "Solid", "Liquid", "Other"], b.phase || "Not recorded")}${field("lot", "Batch / lot number", b.lot || "")}${field("supplier", "Supplier", b.supplier || "")}${field("storage", "Storage location", b.storage || "")}${field("classification", "Classification", b.classification || "")}${field("received", "Date received", b.received || "", "date")}${field("expiry", "Expiration date", b.expiry || "", "date")}${field("analyst", "Analyst / recorded by", b.analyst || "", "text", true)}${isStandard ? field("standardDate", "Standardization date", b.standardDate || today(), "date", true) + field("restandardDate", "Restandardization due", b.restandardDate || "", "date", true) : ""}</div><details class="form-details" ${!isStandard ? "open" : ""}><summary>Chemical reference details</summary><div class="form-grid">${field("formula", "Molecular formula (source)", b.formula || "")}${field("cas", "CAS number (source)", b.cas || "")}${field("hazards", "Key hazards (source, verify SDS)", b.hazards || "")}</div><small class="quiet">Locator values are preserved as supplied. Verify identity and metadata against the actual bottle. Raw section includes supplied reagents; purity is not inferred.</small></details><div class="form-section"><h3>Stock tracking</h3><div class="form-grid">${
      editing
        ? `<div class="field"><span>Fixed stock unit</span><strong>${esc(b.unit)}</strong><small>Use Physical inventory to correct stock quantities.</small></div>`
        : select(
            "unit",
            "Stock unit",
            [
              ["g", "g — net mass"],
              ["mL", "mL — liquid volume"],
            ],
            b.unit || (isStandard ? "mL" : "g"),
          )
    }${densityFields(b)}${field("minimum", "Minimum stock alert", b.minimum ?? "", "number", false, "In the bottle’s stock unit. Leave blank if not set.")}${field("capacity", "Full reference amount", b.capacity ?? "", "number", false, "In the stock unit. Optional; used for an estimated fill bar.")}</div></div>${editing ? "" : measurementFields(b)}${field("notes", "Notes / purity / label details", b.notes || "")}${editing ? field("reason", "Reason for correction", "", "text", true) : ""}<div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">${editing ? "Save correction" : "Register bottle"}</button></div></form>`,
  );
  const form = document.querySelector("#bottle-form");
  bindPhase(form);
  let chosen = source;
  if (chosen || generated || (editing && b.containerCode))
    form.elements.bottleId.readOnly = true;
  if (chosen || state.numberingVersion >= 2)
    form.elements.internalCode.readOnly = true;
  form.elements.stockGroup.addEventListener(
    "change",
    () =>
      (form.elements.internalCode.value = stockCode(
        form.elements.internalCode.value,
        form.elements.stockGroup.value,
      )),
  );
  const picker = document.querySelector("#choose-catalog");
  if (picker)
    picker.onchange = () => {
      const c = catalog.find(
        (c) =>
          picker.value ===
          c.name +
            " — " +
            (c.storage || "No storage") +
            " [" +
            tracingDetails(c).internalCode +
            "]",
      );
      if (c) {
        chosen = c;
        const { draft } = bottleTemplate(state, c);
        for (const [key, value] of Object.entries(draft))
          if (form.elements[key] && value !== null && value !== undefined)
            form.elements[key].value = String(value);
        form.elements.bottleId.readOnly = true;
        form.elements.internalCode.readOnly = true;
        form.elements.phase.dispatchEvent(new Event("change"));
      }
    };
  form.onsubmit = (e) => {
    e.preventDefault();
    try {
      const data = Object.fromEntries(new FormData(form));
      data.section = existing?.section || section;
      data.sourceRow = chosen?.sourceRow || existing?.sourceRow || null;
      data.catalogId = chosen?.id || existing?.catalogId || null;
      if (generated) data.autoNumbering = true;
      if (chosen && !editing) {
        const proposed = nextBottleDetails(state, {
          ...chosen,
          stockGroup: data.stockGroup,
          internalCode: data.internalCode,
        });
        Object.assign(data, proposed, { autoNumbering: true });
      }
      const next = editing
        ? editBottle(state, b.id, data, sourceCatalog)
        : register(state, data, data, sourceCatalog);
      commit(next);
      toast(
        editing
          ? "Bottle details corrected; history retained."
          : "Bottle registered.",
      );
    } catch (err) {
      dialogError(err.message);
    }
  };
}
function detail(key) {
  const b = state.bottles.find((x) => x.id === key);
  if (!b) return;
  showModal(
    b.name,
    `<div class="detail-top"><div><span class="bottle-tag">${esc(b.bottleId)}</span> <span class="type-label">${esc(b.section === "raw" ? "Raw chemical" : "Standardized stock")}</span><h3 class="detail-balance">${num(b.balance)} ${esc(b.balance === null ? "" : b.unit)}</h3>${level(b)}</div><div>${badges(b)}</div></div><div class="button-group"><button class="button primary" id="detail-withdraw" >Withdraw</button><button class="button secondary" id="detail-inventory">Physical inventory</button>${b.section === "standard" ? '<button class="button secondary" id="detail-standard">Restandardize</button>' : ""}<button class="button secondary" id="detail-observe">Visual observation</button><button class="text-button" id="detail-edit">Correct details</button></div><dl class="detail-grid">${[
      ["Stock group", b.stockGroup === "old" ? "Old stock" : "Active"],
      ["Internal chemical code", b.internalCode],
      ["Stable container code", b.containerCode],
      ["Previous bottle labels", (b.legacyBottleIds || []).join("; ")],
      ["Previous chemical codes", (b.legacyInternalCodes || []).join("; ")],
      ["Identity review", b.numberingReview],
      ["Lab code", b.labCode],
      [
        "Formula weight",
        b.formulaWeight ? `${num(b.formulaWeight)} g/mol` : "Not recorded",
      ],
      ["Date opened", b.opened],
      ["Opened by", b.openedBy],
      ["Purity / grade", b.purity],
      ["Physical state", b.phase],
      ["Concentration", b.concentration],
      ["Storage", b.storage],
      ["Classification", b.classification],
      ["Formula", b.formula],
      ["CAS (source)", b.cas],
      ["Hazards (verify SDS)", b.hazards],
      ["Lot / batch", b.lot],
      ["Supplier", b.supplier],
      ["Received", b.received],
      ["Expires", b.expiry],
      ["Standardized", b.standardDate],
      ["Restandardization due", b.restandardDate],
      ["Analyst", b.analyst],
      [
        "Minimum stock",
        b.minimum === null ? "Not set" : `${num(b.minimum)} ${b.unit}`,
      ],
      [
        "Full reference",
        b.capacity === null ? "Not set" : `${num(b.capacity)} ${b.unit}`,
      ],
      [
        "Density",
        b.phase === "Solid"
          ? "Not applicable for solid inventory"
          : b.density === null
            ? "Not set"
            : `${num(b.density)} g/mL at ${b.densityTemp ?? "unrecorded"} °C`,
      ],
      ["Last gross / tare", `${num(b.gross)} / ${num(b.tare)} g`],
      ["Source workbook row", b.sourceRow || "Custom entry"],
      [
        "Disposal status",
        b.disposalStatus === "archived"
          ? "Disposed — archived"
          : b.disposalStatus === "suggested"
            ? "Suggested for disposal"
            : "Not suggested",
      ],
      ["Disposal reason", b.disposal?.reason || b.disposalSuggestion?.reason],
      [
        "Disposed by / date",
        b.disposal ? b.disposal.analyst + " / " + b.disposal.at : "",
      ],
      [
        "Before disposal",
        b.disposal
          ? `${b.disposal.previousBalance ?? "Unknown"} ${b.unit}; gross ${b.disposal.previousGross ?? "Unknown"} g`
          : "",
      ],
      [
        "Shelf-life review",
        shelfReview(b).due
          ? `${shelfReview(b).due} — ${shelfReview(b).basis}`
          : shelfReview(b).missing
            ? "Start date needed"
            : "No estimated date",
      ],
      [
        "Removed record",
        b.deleted
          ? `${b.deleted.at} · ${b.deleted.analyst} · ${b.deleted.reason}`
          : "No",
      ],
      ["Notes", b.notes],
    ]
      .map(
        ([k, v]) =>
          `<div><dt>${k}</dt><dd>${esc(v || "Not recorded")}</dd></div>`,
      )
      .join(
        "",
      )}</dl><h3>Bottle history</h3>${eventTable(state.events.filter((e) => e.bottleKey === key))}`,
  );
  if (b.disposalStatus === "archived" || b.deleted)
    document.querySelector("#modal .button-group").remove();
  const go = (t) => {
    document.querySelector("#modal").close();
    transactionForm(key, t);
  };
  if (b.disposalStatus === "archived" || b.deleted) return;
  document.querySelector("#detail-withdraw").onclick = () => go("Withdrawal");
  document.querySelector("#detail-inventory").onclick = () =>
    go("Physical inventory");
  document.querySelector("#detail-observe").onclick = () =>
    go("Visual observation");
  if (b.section === "standard")
    document.querySelector("#detail-standard").onclick = () =>
      go("Restandardization");
  document.querySelector("#detail-edit").onclick = () => {
    document.querySelector("#modal").close();
    bottleForm(null, b);
  };
}
function observationFields(required = false) {
  return `<details class="form-details" ${required ? "open" : ""}><summary>${required ? "Record visual observation" : "Optional visual level after transaction"}</summary><div class="form-grid">${select("visual", "Observed liquid level", [["", "Not recorded"], "Full", "Three-quarter / high", "Half / mid", "Quarter / low", "Empty"], "")}${field("height", "Liquid height from inside base", "", "number", false, "Observation only; never used to calculate stock.")}${select("heightUnit", "Height unit", ["cm", "in"], "cm")}</div></details>`;
}
function transactionForm(key, type) {
  const b = state.bottles.find((x) => x.id === key);
  showModal(
    type,
    `<form id="transaction-form"><div class="notice"><div><strong>${esc(b.bottleId)} · ${esc(b.name)}</strong><br>Available: ${num(b.balance)} ${esc(b.unit)}${b.concentration ? " · " + esc(b.concentration) : ""}</div></div>${
      type === "Withdrawal"
        ? `${select(
            "withdrawalMode",
            "Withdrawal method",
            [
              ["amount", "Known net quantity"],
              ["gross", "Before / after bottle weights"],
            ],
            b.balance === null ? "gross" : "amount",
          )}<div id="amount-withdrawal" class="form-grid">${field("amount", "Quantity to withdraw", "", "number", true)}${select("unit", "Withdrawal unit", b.phase === "Solid" ? ["g"] : ["g", "mL"], b.unit)}</div><div id="gross-withdrawal"><div class="form-grid">${field("weightBefore", "Bottle weight before (g)", b.gross ?? "", "number", true)}${field("weightAfter", "Bottle weight after (g)", "", "number", true)}</div><label class="check"><input type="checkbox" name="sameContainer">Same bottle, cap and container configuration for both readings</label><p class="quiet">Difference is grams removed. The after-reading becomes the latest gross weight. Unknown net stock remains unknown.</p></div>`
        : type === "Physical inventory"
          ? measurementFields(b)
          : type === "Restandardization"
            ? `<div class="form-grid">${field("concentration", "New verified concentration", b.concentration, "text", true)}${field("standardDate", "Standardization date", today(), "date", true)}${field("restandardDate", "Next restandardization due", "", "date", true)}</div>`
            : ""
    }<div class="form-grid">${field("analyst", "Analyst", "", "text", true)}${field("reason", type === "Withdrawal" ? "Purpose / test / use" : "Reason / reference", "", "text", true)}</div>${["Withdrawal", "Physical inventory", "Visual observation"].includes(type) ? observationFields(type === "Visual observation") : ""}${type === "Physical inventory" ? '<div class="notice">This records a new physical balance, not an addition. The previous balance and adjustment remain in history. Gross weighing without tare makes the balance unknown.</div>' : ""}<div class="dialog-actions"><button type="button" class="button secondary" data-close>Cancel</button><button class="button primary" type="submit">${type === "Withdrawal" ? "Record withdrawal" : "Save record"}</button></div></form>`,
  );
  const form = document.querySelector("#transaction-form");
  if (type === "Withdrawal") {
    const mode = form.elements.withdrawalMode;
    const sync = () => {
      for (const [id, active] of [
        ["amount-withdrawal", mode.value === "amount"],
        ["gross-withdrawal", mode.value === "gross"],
      ]) {
        const group = document.getElementById(id);
        group.hidden = !active;
        group
          .querySelectorAll("input,select")
          .forEach((x) => (x.disabled = !active));
      }
    };
    mode.onchange = sync;
    sync();
  }
  document.querySelector("#transaction-form").onsubmit = (e) => {
    e.preventDefault();
    try {
      const input = Object.fromEntries(new FormData(e.target));
      input.type = type;
      commit(transact(state, key, input));
      toast(type + " recorded.");
    } catch (err) {
      dialogError(err.message);
    }
  };
}
async function pngLogo() {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 1024;
        canvas.height = 436;
        canvas.getContext("2d").drawImage(img, 0, 0, 1024, 436);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("Unable to load the embedded logo."));
    img.src = logo;
  });
}
function exportDialog(bottles, initialCategory = "") {
  const selectedKeys = new Set(bottles.map((b) => b.id));
  let busy = false;
  showModal(
    "Create report",
    `${select("exportCategory", "Chemical category", [["", "All categories"], ...["Acids", "Bases", "Oxidizers", "Salts", "Solvents", "Indicators", "Other / unclassified"].map((c) => [c, c])], initialCategory)}<p class="quiet">Current view, search, storage and stock-group filters still apply. Choose the rows, columns and sections you need. For restoration, use a JSON backup.</p><p id="export-count"></p><fieldset class="report-options"><legend>Report contents</legend><label><input type="checkbox" id="report-inventory" checked> Bottle inventory</label><label><input type="checkbox" id="report-overview"> Consolidated chemical overview (working stock)</label><label><input type="checkbox" id="report-log"> Withdrawal / activity log</label></fieldset><details class="form-details"><summary>Choose inventory columns</summary><div class="report-columns">${reportFields.map(([k, label]) => `<label><input type="checkbox" data-report-field="${k}" ${defaultReportFields.includes(k) ? "checked" : ""}>${esc(label)}</label>`).join("")}</div></details><details class="form-details"><summary>Choose chemicals and bottles</summary><button class="text-button" id="report-all">Select all shown</button> <button class="text-button" id="report-none">Clear shown</button><div id="report-rows"></div></details><div class="export-options">${[
      ["xlsx", "Excel report"],
      ["pdf", "PDF report"],
      ["docx", "Word report"],
      ["csv", "CSV report"],
    ]
      .map(
        ([v, t]) =>
          `<button class="export-option" data-format="${v}"><strong>${t}</strong></button>`,
      )
      .join("")}</div>`,
  );
  const picker = document.querySelector("[name=exportCategory]");
  const shown = () =>
    bottles.filter(
      (b) => !picker.value || group(b.classification) === picker.value,
    );
  const selection = () => {
    const rows = shown().filter((b) => selectedKeys.has(b.id)),
      keys = new Set(rows.map((b) => b.id));
    return { rows, events: state.events.filter((e) => keys.has(e.bottleKey)) };
  };
  const options = () => ({
    category: picker.value || "All categories",
    scope:
      view === "archive"
        ? "Disposal archive"
        : view === "removed"
          ? "Removed bottle records"
          : section === "raw"
            ? "Raw chemicals"
            : "Standardized stocks",
    inventory: document.querySelector("#report-inventory").checked,
    overview: document.querySelector("#report-overview").checked,
    log: document.querySelector("#report-log").checked,
    fields: [...document.querySelectorAll("[data-report-field]:checked")].map(
      (e) => e.dataset.reportField,
    ),
  });
  const refresh = () => {
    const { rows, events } = selection(),
      o = options();
    document.querySelector("#export-count").textContent =
      `${rows.length} selected of ${shown().length} entries · ${events.length} related log entries`;
    document
      .querySelectorAll("[data-format]")
      .forEach(
        (b) =>
          (b.disabled =
            busy ||
            !rows.length ||
            (!o.inventory && !o.overview && !o.log) ||
            (!o.inventory &&
              (!o.overview || !chemicalOverview(rows).length) &&
              (!o.log || !events.length)) ||
            (o.inventory && !o.fields.length)),
      );
  };
  const renderRows = () => {
    document.querySelector("#report-rows").innerHTML = shown()
      .map(
        (b) =>
          `<label class="report-row"><input type="checkbox" data-report-row="${esc(b.id)}" ${selectedKeys.has(b.id) ? "checked" : ""}>${esc(b.name)} · ${esc(b.bottleId || b.internalCode || "Not recorded")} · ${b.balance === null ? "Not entered" : num(b.balance) + " " + esc(b.unit)}</label>`,
      )
      .join("");
    document.querySelectorAll("[data-report-row]").forEach(
      (e) =>
        (e.onchange = () => {
          if (e.checked) selectedKeys.add(e.dataset.reportRow);
          else selectedKeys.delete(e.dataset.reportRow);
          refresh();
        }),
    );
    refresh();
  };
  picker.onchange = renderRows;
  document.querySelector("#report-all").onclick = () => {
    shown().forEach((b) => selectedKeys.add(b.id));
    renderRows();
  };
  document.querySelector("#report-none").onclick = () => {
    shown().forEach((b) => selectedKeys.delete(b.id));
    renderRows();
  };
  document
    .querySelectorAll(
      "[data-report-field],#report-inventory,#report-overview,#report-log",
    )
    .forEach((e) => (e.onchange = refresh));
  renderRows();
  document.querySelectorAll("[data-format]").forEach(
    (el) =>
      (el.onclick = async () => {
        busy = true;
        const controls = [
          ...document.querySelectorAll(
            "#modal input,#modal select,#report-all,#report-none",
          ),
        ];
        controls.forEach((c) => (c.disabled = true));
        refresh();
        try {
          const { rows, events } = selection();
          await exportReadable(
            el.dataset.format,
            rows,
            events,
            el.dataset.format === "csv" ? null : await pngLogo(),
            options(),
          );
          toast("Report downloaded.");
        } catch (err) {
          dialogError("Export failed: " + err.message);
        } finally {
          busy = false;
          controls.forEach((c) => (c.disabled = false));
          refresh();
        }
      }),
  );
}

render();
