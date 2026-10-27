import defaultLogo from "./assets/shemberg-logo.png?inline";
import "./style.css";
import {
  normalize,
  boxKey,
  summarize,
  duplicateFlags,
  collator,
  compareSamples,
  sortOriginals,
  importBatches,
  replaceScope,
  updateScope,
} from "./core.js";
import {
  reportModel,
  originalSections,
  excelReport,
  wordReport,
  pdfReport,
  readInventoryFile,
  saveBlob,
} from "./reports.js";
const KEY = "shemberg.inventory.v1",
  LOGO = "shemberg.logo.v1";
const e = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let records = [],
  logo = defaultLogo,
  sessionAt = new Date().toISOString(),
  editing = null,
  preview = [],
  flags = [],
  loadError = "",
  undoRecords = null,
  management = null,
  pendingImport = null;
try {
  const raw = JSON.parse(localStorage.getItem(KEY) || "[]");
  if (!Array.isArray(raw)) throw Error("Invalid stored records");
  records = raw.map((r) => {
    if (!r.id) throw Error("Missing record ID");
    return normalize(r);
  });
  logo = localStorage.getItem(LOGO) || defaultLogo;
} catch (err) {
  loadError =
    "Saved data could not be loaded. To protect it, saving is disabled. Export your browser storage or restore a valid backup before continuing.";
}
const app = document.querySelector("#app");
app.innerHTML = `<aside class="sidebar"><a class="brand" href="#"><img class="brand-logo" src="${defaultLogo}" alt="Shemberg"><span><small>INVENTORY WORKSPACE</small></span></a><div class="nav-label">WORKSPACE</div><a class="nav active" href="#inventory">▦ <span>Inventory overview</span></a><a class="nav" href="#products">◈ <span>Sample summary</span></a><a class="nav" href="#tools">⇅ <span>Import & reports</span></a><div class="sidebar-bottom"><span class="status-dot"></span> Stored on this browser<small>Export regularly to keep a backup.</small></div></aside><main><header><div class="breadcrumb">Workspace <span>/</span> Toothpaste inventory</div><div class="session"><span class="status-dot"></span><span id="session-label"></span><button id="new-session" class="text-button">New session</button></div></header><section class="page-title" id="inventory"><div><div class="eyebrow">WAREHOUSE OPERATIONS</div><h1>Toothpaste inventory</h1><p>A clear view of every product, one box at a time.</p></div><button class="primary" id="add">＋ Add inventory</button></section><button id="undo" hidden>Undo last inventory change</button><div id="notice" role="status" aria-live="polite"></div><section class="panel sheet-settings"><div><h2>Inventory sheet header</h2><p>Set the box and stock-count date before entering or importing a sheet.</p></div><label>Date of Inventory (session)<input id="inventory-session-date" type="date" required></label><label>Box Number<input id="entry-box" maxlength="100" placeholder="e.g. 1 (Brown) — blank is unassigned"></label></section><section class="metrics" id="metrics"></section><p id="bundle-summary" class="hint"></p><section class="panel tools" id="tools"><div><h2>Inventory workspace</h2><p>Box first. Sample date next. Every original entry preserved.</p></div><div class="actions"><label class="button">↑ Import file<input id="import-file" type="file" accept=".csv,.xlsx" hidden></label><button id="batches-open">Manage imports / batches</button><button id="import-format" title="Import format and CSV template">Template</button><button id="preview-report">Report preview</button><button id="export-open" class="dark">↓ Export report</button></div></section><section class="panel filters"><label class="search"><span>⌕</span><input id="search" placeholder="Search products, boxes, or remarks…" aria-label="Search inventory"></label><label>Box<select id="box-filter"><option value="all">All boxes</option></select></label><label>Sample date from<input type="date" id="from"></label><label>Sample date to<input type="date" id="to"></label><label>Inventory session<select id="inventory-date-filter"><option value="all">All session dates</option></select></label><label>View<select id="view"><option value="consolidated">Consolidated view</option><option value="original">Original records</option></select></label><label>Sort within box<select id="sort"><option value="date">Sample date, then sample</option><option value="code">Sample, then date</option><option value="quantity">Quantity, high to low</option></select></label><button id="reset">Reset</button></section><div class="list-meta"><span id="shown"></span><span>BOX-FIRST VIEW <span class="tag">Auto-consolidated</span></span></div><section id="boxes"></section><section class="panel products" id="products"><div class="section-heading"><div><h2>Overall sample summary</h2><p>Totals across the current filtered inventory.</p></div></div><div id="product-table"></div></section><section class="panel branding"><div><h2>Your Shemberg branding</h2><p>Upload the official logo for the application and all reports. PNG, JPEG, or AVIF, up to 2 MB.</p></div><div class="actions"><img id="logo-preview" alt="Uploaded Shemberg logo" hidden><label class="button">Upload logo<input id="logo-file" type="file" accept="image/png,image/jpeg,image/avif" hidden></label><button id="remove-logo">Reset logo</button></div></section><footer><span>SHEMBERG · INVENTORY MANAGEMENT · v1.4</span><span>Local storage · No account required</span></footer></main>
<dialog id="record-dialog"><form id="record-form"><div class="dialog-heading"><div><div class="eyebrow">INVENTORY RECORD</div><h2 id="form-title">Add inventory</h2></div><button type="button" data-close="record-dialog" aria-label="Close">✕</button></div><div class="form-grid"><label>Box Number<input name="box" maxlength="100" placeholder="e.g. 1 (Brown) — blank if unassigned"></label><label>Date of Inventory (session)<input name="date" type="date" required></label><label>Date (sample date)<input name="sampleDate" type="date" required></label><label>Samples (name or code)<input name="code" maxlength="100" required placeholder="Enter the sample name or code as written"></label><label>Quantity (units)<input name="quantity" type="number" min="0" max="9007199254740991" step="1" required></label><label class="wide">Remarks<textarea name="remarks" maxlength="2000" rows="3" placeholder="Condition, bundles, or counting notes"></textarea></label><details class="wide advanced-record"><summary>Additional details (optional)</summary><label>Sample type<input name="type" maxlength="100"></label><label>Description<input name="description" maxlength="500"></label></details></div><p class="hint">Date of Inventory is the sheet-level stock-count date. Date is the original sample date. Enter Date, Samples, Quantity and Remarks as written. The app sorts the unsorted rows and combines matching samples and dates, preserving every original remark and quantity.</p><div class="dialog-actions"><button type="button" data-close="record-dialog">Cancel</button><button class="primary" type="submit">Save record</button></div></form></dialog>
<dialog id="import-dialog" class="large"><div class="dialog-heading"><div><div class="eyebrow">REVIEW BEFORE SAVING</div><h2>Import preview</h2></div><button data-close="import-dialog" aria-label="Close">✕</button></div><p id="import-summary"></p><label class="batch-name-label">Import / batch name<input id="import-name" maxlength="200" required></label><p class="hint">Possible duplicates match the inventory session date, sample date, sample name/code, type, quantity, box, description, and remarks. Review before confirming. Check the session date and box in this preview. Blank box cells stay unassigned; missing Box Number columns use the sheet header.</p><label class="check"><input id="skip-duplicates" type="checkbox"> Skip confirmed duplicates (otherwise keep every source entry)</label><div id="import-preview" class="scroll"></div><div class="dialog-actions"><button data-close="import-dialog">Cancel</button><button id="confirm-import" class="primary">Confirm import</button></div></dialog>
<dialog id="report-dialog" class="large"><div class="dialog-heading"><div><div class="eyebrow">REPORT CENTER</div><h2>Inventory report preview</h2></div><button data-close="report-dialog" aria-label="Close">✕</button></div><p class="hint">Reports use your current search and filters, always sorted by box, sample date, and sample name/code. Different inventory session dates remain separate. Original entries and overall product totals are included.</p><div class="actions report-actions"><button data-export="xlsx">↓ Excel (.xlsx)</button><button data-export="docx">↓ Word (.docx)</button><button data-export="pdf" class="primary">↓ PDF</button></div><div id="report-content"></div></dialog>
<dialog id="help-dialog"><h2>Import inventory</h2><p>Choose a CSV or Excel (.xlsx) file with these headers:</p><p class="hint">Date, Samples, Quantity, Remarks. Optionally include Box Number and Date of Inventory; otherwise the sheet header supplies them. These four columns are sufficient, in any row order. No bundle columns are needed.</p><p>Date means the sample date. Date of Inventory is the separate session date. Use YYYY-MM-DD dates or Excel date cells. Blank box cells remain unassigned. Excel reports from this application import the Original Records worksheet to avoid double counting.</p><div class="dialog-actions"><button id="template">Download CSV template</button><button data-close="help-dialog">Close</button></div></dialog>
<dialog id="batches-dialog" class="large"><div class="dialog-heading"><div><h2>Imports and batches</h2><p>Manage entire saved imports, independent of the current search and filters.</p></div><button data-close="batches-dialog">✕</button></div><div id="batch-list"></div></dialog>
<dialog id="manage-dialog" class="large"><div class="dialog-heading"><h2 id="manage-title">Manage records</h2><button data-close="manage-dialog">✕</button></div><p id="manage-summary"></p><p class="hint">Check only the fields you want to change. Source quantities, sample dates and remarks remain unchanged. This operation includes all listed records, even if hidden by search or date-range filters.</p><form id="bulk-form"><div class="form-grid" id="bulk-fields"></div><div class="dialog-actions"><button type="submit" class="primary">Apply checked changes</button><label class="button">Reimport to replace<input id="replace-file" type="file" accept=".csv,.xlsx" hidden></label><button id="delete-scope" class="danger" type="button">Delete these records</button></div></form><details><summary>Review affected original records</summary><div id="scope-records"></div></details></dialog>`;
const $ = (s) => document.querySelector(s);
function notice(message, error = false) {
  $("#notice").textContent = message;
  $("#notice").className = message ? `notice ${error ? "error" : ""}` : "";
}
function persist(next) {
  if (loadError) throw Error(loadError);
  if (!Number.isSafeInteger(summarize(next).quantity))
    throw Error("Total quantity exceeds the supported whole-number range.");
  localStorage.setItem(KEY, JSON.stringify(next));
  undoRecords = records;
  records = next;
  render();
}
function filtered() {
  const q = $("#search").value.toLowerCase(),
    b = $("#box-filter").value,
    from = $("#from").value,
    to = $("#to").value;
  return records.filter(
    (r) =>
      (b === "all" || boxKey(r.box) === b) &&
      ($("#inventory-date-filter").value === "all" ||
        r.date === $("#inventory-date-filter").value) &&
      (from === "" || r.sampleDate >= from) &&
      (to === "" || (!!r.sampleDate && r.sampleDate <= to)) &&
      [
        r.code,
        r.description,
        r.box,
        r.remarks,
        r.bundle || "",
        r.type || "",
      ].some((s) => s.toLowerCase().includes(q)),
  );
}
function dataTable(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function sourceTable(sources, editable = true) {
  return dataTable(
    ["Date", "Samples", "Quantity", "Remarks"],
    sources.map(
      (r) =>
        `<tr><td>${e(r.sampleDate) || "NOT RECORDED"}</td><td>${e(r.code)}${r.type ? `<small class="legacy-ref">${e(r.type)}</small>` : ""}</td><td>${r.quantity}</td><td class="remarks"><span class="original-remark">${e(r.remarks) || "—"}</span>${editable ? `<div class="row-actions"><button data-edit="${e(r.id)}">Edit</button><button data-delete="${e(r.id)}" class="danger">Delete</button></div><details class="record-info"><summary>Record info</summary><p>Box: ${e(r.box) || "UNASSIGNED BOX"} · Date of Inventory: ${e(r.date)}</p><p>Import: ${e(r.batchName) || "Existing / manual records"}</p><p>Entered: ${e(r.sessionAt) || "Not recorded"}</p>${r.description ? `<p>${e(r.description)}</p>` : ""}${r.originalBundle ? `<p>Original bundle reference: ${e(r.originalBundle)}</p>` : ""}</details>` : ""}</td></tr>`,
    ),
  );
}
function boxHTML(b, editable = true, sort = "date", original = false) {
  const rows = [...b.rows];
  if (sort === "code")
    rows.sort(
      (a, b) => collator.compare(a.code, b.code) || compareSamples(a, b),
    );
  if (sort === "quantity")
    rows.sort((a, b) => b.quantity - a.quantity || compareSamples(a, b));
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const heading = `<div class="box-heading"><div class="box-icon">▣</div><h2>${b.key ? `BOX NO. ${e(b.label)}` : "UNASSIGNED BOX"}</h2><span class="tag neutral">${original ? rows.reduce((n, r) => n + r.sources.length, 0) : rows.length} ${original ? "original" : "consolidated"} records</span>${editable ? `<button data-manage-box="${e(b.key)}">Manage box</button>` : ""}<span class="box-units">${b.total.toLocaleString()} <small>units</small></span></div><div class="sheet-caption">Date of Inventory: ${e(dates.join(", "))}</div>`;
  const body = original
    ? sourceTable(
        rows.flatMap((r) => r.sources),
        editable,
      )
    : dataTable(
        ["Date", "Samples", "Quantity", "Remarks"],
        rows.map(
          (r) =>
            `<tr><td>${e(r.sampleDate) || '<span class="danger">NOT RECORDED</span>'}</td><td><span class="code">${e(r.code)}</span>${r.type ? `<small class="legacy-ref">${e(r.type)}</small>` : ""}</td><td class="quantity">${r.quantity.toLocaleString()}</td><td class="remarks">${dates.length > 1 ? `<small class="legacy-ref">Inventory: ${e(r.date)}</small>` : ""}<details><summary><span>${e(r.remarks.join(" · ")) || "No remarks"}</span><small>${r.sources.length} source ${r.sources.length === 1 ? "entry" : "entries"} · View original entries</small></summary>${remarkBreakdown(r)}${sourceTable(r.sources, editable)}</details></td></tr>`,
        ),
      );
  return `<article class="panel box">${heading}${body}<div class="box-footer"><span>BOX TOTAL</span><strong>${b.total.toLocaleString()} units</strong></div></article>`;
}
function render() {
  $("#undo").hidden = !undoRecords;
  $("#bundle-summary").textContent =
    "Enter or import the sheet in any order. Matching samples and dates consolidate automatically; expand Remarks to verify every original entry.";
  const old = $("#box-filter").value;
  const oldSession = $("#inventory-date-filter").value;
  $("#inventory-date-filter").innerHTML =
    '<option value="all">All session dates</option>' +
    [...new Set(records.map((r) => r.date))]
      .sort()
      .map((d) => `<option value="${e(d)}">${e(d)}</option>`)
      .join("");
  $("#inventory-date-filter").value = [
    ...$("#inventory-date-filter").options,
  ].some((o) => o.value === oldSession)
    ? oldSession
    : "all";
  const all = summarize(records);
  $("#box-filter").innerHTML =
    '<option value="all">All boxes</option>' +
    all.boxes
      .map(
        (b) =>
          `<option value="${e(b.key)}">${b.key ? `Box ${e(b.label)}` : "UNASSIGNED BOX"}</option>`,
      )
      .join("");
  $("#box-filter").value = [...$("#box-filter").options].some(
    (o) => o.value === old,
  )
    ? old
    : "all";
  const visible = filtered(),
    s = summarize(visible);
  $("#metrics").innerHTML = [
    ["Assigned boxes", s.boxCount, "Unassigned stock shown separately"],
    ["Unique samples", s.products.length, "Across selected inventory"],
    ["Total quantity", s.quantity, "Individual units in stock"],
    [
      "Original records",
      s.originalCount,
      `${s.consolidatedCount} consolidated records`,
    ],
  ]
    .map(
      ([label, n, sub]) =>
        `<div class="metric"><span>${label}</span><strong>${n.toLocaleString()}</strong><small>${sub}</small></div>`,
    )
    .join("");
  $("#shown").textContent =
    `${visible.length} of ${records.length} original records · ${s.boxes.length} groups`;
  $("#boxes").innerHTML = s.boxes.length
    ? s.boxes
        .map((b) =>
          boxHTML(b, true, $("#sort").value, $("#view").value === "original"),
        )
        .join("") +
      `<div class="grand-total"><span>GRAND TOTAL <small>Current filtered inventory</small></span><strong>${s.quantity.toLocaleString()} units</strong></div>`
    : `<div class="panel empty"><div class="empty-icon">▣</div><h2>${records.length ? "No matching inventory" : "Your inventory starts here"}</h2><p>${records.length ? "Adjust your search or filters to find records." : "Add your first count or import a spreadsheet to organize stock by box."}</p><button class="primary" id="empty-add">＋ Add inventory</button><button id="import-help">Import format & template</button></div>`;
  $("#product-table").innerHTML = s.products.length
    ? dataTable(
        ["Samples", "Total quantity"],
        s.products.map(
          (p) =>
            `<tr><td><span class="code">${e(p.code)}</span></td><td class="quantity">${p.quantity.toLocaleString()}</td></tr>`,
        ),
      )
    : '<p class="hint">Sample totals will appear when inventory is added.</p>';
  $("#session-label").textContent =
    `Entry session started: ${new Date(sessionAt).toLocaleString()}`;
  $("#logo-preview").hidden = !logo;
  if (logo) {
    $("#logo-preview").src = logo;
    $(".brand-logo").src = logo;
  }
}
function openForm(record) {
  editing = record?.id || null;
  const f = $("#record-form");
  f.reset();
  $(".advanced-record").open = false;
  for (const key of [
    "date",
    "sampleDate",
    "code",
    "description",
    "quantity",
    "box",
    "remarks",
    "type",
  ])
    f.elements[key].value =
      record?.[key] ??
      (key === "date"
        ? $("#inventory-session-date").value
        : key === "box"
          ? $("#entry-box").value
          : "");
  $("#form-title").textContent = record
    ? "Edit original record"
    : "Add inventory";
  $("#record-dialog").showModal();
}
$("#add").onclick = () => openForm();
$("#new-session").onclick = () => {
  sessionAt = new Date().toISOString();
  render();
  notice(
    "New inventory session started. Existing records keep their original timestamps.",
  );
};
$("#record-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const existing = records.find((r) => r.id === editing),
      r = normalize({
        ...existing,
        ...Object.fromEntries(new FormData(event.target)),
        id: editing || crypto.randomUUID(),
        sessionAt: existing?.sessionAt || sessionAt,
        updatedAt: new Date().toISOString(),
      });
    if (!r.sampleDate)
      throw Error(
        "Date (sample date) is required; do not guess an unknown date.",
      );
    persist(
      editing
        ? records.map((x) => (x.id === editing ? r : x))
        : [...records, r],
    );
    $("#record-dialog").close();
    notice("Inventory record saved.");
  } catch (err) {
    alert(err.message);
  }
};
app.addEventListener("click", (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.close) $("#" + button.dataset.close).close();
  if (button.hasAttribute("data-manage-box")) {
    const key = button.dataset.manageBox,
      session = $("#inventory-date-filter").value;
    const list = records.filter(
      (r) => boxKey(r.box) === key && (session === "all" || r.date === session),
    );
    openManagement({
      kind: "box",
      key,
      label: key ? `Box ${list[0]?.box}` : "UNASSIGNED BOX",
      ids: list.map((r) => r.id),
      date: session,
    });
  }
  if (button.dataset.manageBatch) {
    const b = importBatches(records).find(
      (b) => b.id === button.dataset.manageBatch,
    );
    if (b) {
      $("#batches-dialog").close();
      openManagement({
        kind: "batch",
        label: b.name,
        ids: b.records.map((r) => r.id),
        batchId: b.id,
      });
    }
  }
  if (button.id === "empty-add") openForm();
  if (button.id === "import-help" || button.id === "import-format")
    $("#help-dialog").showModal();
  if (button.dataset.edit)
    openForm(records.find((r) => r.id === button.dataset.edit));
  if (
    button.dataset.delete &&
    confirm("Delete this original record? This cannot be undone.")
  ) {
    try {
      persist(records.filter((r) => r.id !== button.dataset.delete));
      notice("Record deleted and totals recalculated.");
    } catch (err) {
      notice(err.message, true);
    }
  }
});
for (const id of [
  "search",
  "box-filter",
  "from",
  "to",
  "sort",
  "inventory-date-filter",
  "view",
])
  $("#" + id).addEventListener(id === "search" ? "input" : "change", render);
$("#reset").onclick = () => {
  for (const id of ["search", "from", "to"]) $("#" + id).value = "";
  $("#box-filter").value = "all";
  $("#sort").value = "date";
  $("#inventory-date-filter").value = "all";
  render();
};
async function previewImport(event, scope = null) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const target = scope ? records.filter((r) => scope.ids.includes(r.id)) : [];
    const dates = [...new Set(target.map((r) => r.date))],
      boxes = [...new Set(target.map((r) => r.box))];
    const defaults = {
      inventoryDate:
        scope && dates.length === 1
          ? dates[0]
          : $("#inventory-session-date").value,
      box: scope && boxes.length === 1 ? boxes[0] : $("#entry-box").value,
    };
    preview = await readInventoryFile(file, defaults);
    if (!preview.length) throw Error("No inventory records found.");
    if (preview.length > 50000)
      throw Error("Import at most 50,000 records per file.");
    if (
      scope?.kind === "box" &&
      preview.some(
        (r) =>
          boxKey(r.box) !== scope.key ||
          (scope.date !== "all" && r.date !== scope.date),
      )
    )
      throw Error(
        "A box replacement file must contain only the selected box and selected inventory session. To rename a box, use bulk edit first.",
      );
    pendingImport = { scope, filename: file.name };
    flags = duplicateFlags(
      records.filter((r) => !scope?.ids.includes(r.id)),
      preview,
    );
    $("#skip-duplicates").checked = false;
    $("#import-name").value = scope?.label || file.name;
    $("#import-summary").textContent =
      `${preview.length} valid original records · ${flags.filter(Boolean).length} possible duplicates · ${scope ? `REPLACE ${target.length} existing records in ${scope.label}` : "ADD a new import batch"} · Nothing has been saved yet.`;
    $("#import-preview").innerHTML = dataTable(
      ["Date", "Samples", "Quantity", "Remarks"],
      preview.map(
        (r, i) =>
          `<tr class="${flags[i] ? "duplicate" : ""}"><td>${e(r.sampleDate) || "NOT RECORDED"}</td><td>${e(r.code)}<small class="legacy-ref">Box: ${e(r.box) || "UNASSIGNED BOX"} · Inventory: ${e(r.date)}</small></td><td>${r.quantity}</td><td class="remarks">${flags[i] ? '<span class="tag">Possible duplicate</span>' : ""}${e(r.remarks)}</td></tr>`,
      ),
    );
    $("#confirm-import").textContent = scope
      ? "Confirm replacement"
      : "Confirm import";
    $("#import-dialog").showModal();
  } catch (err) {
    notice(`Import failed: ${err.message}`, true);
    alert(`Import failed: ${err.message}`);
  } finally {
    event.target.value = "";
  }
}
$("#import-file").onchange = (event) => previewImport(event);
$("#replace-file").onchange = (event) => previewImport(event, management);
$("#confirm-import").onclick = () => {
  try {
    if (!pendingImport) throw Error("Select a file first.");
    const scope = pendingImport.scope,
      batchId =
        scope?.kind === "batch" && scope.batchId !== "__legacy__"
          ? scope.batchId
          : crypto.randomUUID();
    const batchName = $("#import-name").value.trim();
    if (!batchName) throw Error("Enter an import / batch name.");
    const now = new Date().toISOString();
    const incoming = preview
      .filter((_, i) => !$("#skip-duplicates").checked || !flags[i])
      .map((r) => ({
        ...r,
        id: crypto.randomUUID(),
        batchId,
        batchName,
        sourceFile: pendingImport.filename,
        sessionAt: r.sessionAt || sessionAt,
        importedAt: now,
      }));
    if (!incoming.length) {
      if (scope)
        throw Error(
          "No replacement rows selected. Existing records were kept.",
        );
      $("#import-dialog").close();
      preview = [];
      pendingImport = null;
      notice(
        "No records imported: all selected rows were possible duplicates. Existing records were kept.",
      );
      return;
    }
    if (
      scope &&
      !confirm(
        `Replace ${scope.ids.length} existing records in ${scope.label} with ${incoming.length} corrected records? Other records will be kept.`,
      )
    )
      return;
    persist(
      scope
        ? replaceScope(records, scope.ids, incoming)
        : [...records, ...incoming],
    );
    $("#import-dialog").close();
    if (scope) $("#manage-dialog").close();
    preview = [];
    pendingImport = null;
    notice(
      `${scope ? "Replaced selected records with" : "Imported"} ${incoming.length} original records. Undo last inventory change is available until refresh.`,
    );
  } catch (err) {
    alert(err.message);
  }
};
$("#template").onclick = () =>
  saveBlob(
    new Blob(["Date,Samples,Quantity,Remarks\r\n"], {
      type: "text/csv",
    }),
    "shemberg-import-template.csv",
  );
function openReport() {
  const m = reportModel(filtered(), logo);
  $("#report-content").innerHTML =
    `${logo ? `<img class="report-logo" src="${logo}" alt="Shemberg logo">` : ""}<h2>SHEMBERG · Toothpaste inventory</h2><p>Report generated: ${e(m.generatedAt)}</p><p>${m.boxCount} assigned boxes · ${m.products.length} unique samples · ${m.originalCount} original records · ${m.consolidatedCount} consolidated records</p><p>Dates of Inventory: ${e(m.inventoryDates.join(", "))}</p><details><summary>Entry timestamps (${m.sessions.length})</summary>${m.sessions.map((s) => `<p>${e(s)}</p>`).join("")}</details>${m.boxes.map((b) => boxHTML(b, false)).join("")}<h2>GRAND TOTAL: ${m.quantity.toLocaleString()} units</h2><h3>Overall sample summary</h3>${dataTable(
      ["Samples", "Total quantity"],
      m.products.map(
        (p) => `<tr><td>${e(p.code)}</td><td>${p.quantity}</td></tr>`,
      ),
    )}<h3>Original records</h3>${originalSections(m)
      .map(
        (group) =>
          `<h4>${group.box ? `BOX NO. ${e(group.box)}` : "UNASSIGNED BOX"} · Date of Inventory: ${e(group.date)}</h4>${sourceTable(group.records, false)}`,
      )
      .join("")}<h2>GRAND TOTAL: ${m.quantity.toLocaleString()} units</h2>`;
  $("#report-dialog").showModal();
}
$("#preview-report").onclick = openReport;
$("#export-open").onclick = openReport;
for (const button of document.querySelectorAll("[data-export]"))
  button.onclick = async () => {
    button.disabled = true;
    const old = button.textContent;
    button.textContent = "Generating…";
    try {
      const format = button.dataset.export,
        m = reportModel(filtered(), logo),
        blob = await { xlsx: excelReport, docx: wordReport, pdf: pdfReport }[
          format
        ](m);
      saveBlob(
        blob,
        `shemberg-inventory-${m.generatedAt.slice(0, 10)}.${format}`,
      );
      notice(
        `${format.toUpperCase()} report generated from ${m.originalCount} original records.`,
      );
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    } finally {
      button.disabled = false;
      button.textContent = old;
    }
  };
$("#logo-file").onchange = async (event) => {
  try {
    const f = event.target.files[0];
    if (!f) return;
    if (
      !["image/png", "image/jpeg", "image/avif"].includes(f.type) ||
      f.size > 2 * 1024 * 1024
    )
      throw Error("Choose a PNG, JPEG, or AVIF under 2 MB.");
    const bitmap = await createImageBitmap(f);
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 600 / bitmap.width, 240 / bitmap.height);
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const next = canvas.toDataURL("image/png");
    localStorage.setItem(LOGO, next);
    logo = next;
    render();
    notice("Logo saved for this browser and all reports.");
  } catch (err) {
    notice(err.message, true);
  } finally {
    event.target.value = "";
  }
};
$("#remove-logo").onclick = () => {
  try {
    localStorage.removeItem(LOGO);
    logo = defaultLogo;
    render();
  } catch (err) {
    notice(err.message, true);
  }
};
window.addEventListener("storage", (event) => {
  if (event.key === KEY) location.reload();
});
$("#inventory-session-date").value = localDate();
try {
  const saved = JSON.parse(localStorage.getItem("shemberg.sheet.v1") || "{}");
  if (saved.inventoryDate)
    $("#inventory-session-date").value = saved.inventoryDate;
  $("#entry-box").value = saved.box || "";
} catch {}
for (const id of ["inventory-session-date", "entry-box"])
  $("#" + id).onchange = () => {
    try {
      localStorage.setItem(
        "shemberg.sheet.v1",
        JSON.stringify({
          inventoryDate: $("#inventory-session-date").value,
          box: $("#entry-box").value,
        }),
      );
    } catch (err) {
      notice(err.message, true);
    }
  };
function remarkBreakdown(row) {
  return `<ul class="remark-breakdown">${row.remarkBreakdown.map((d) => `<li><strong>${d.quantity} units</strong> · ${d.count} original ${d.count === 1 ? "entry" : "entries"} · ${e(d.remarks) || "No remarks"}</li>`).join("")}</ul>`;
}
function openManagement(scope) {
  management = scope;
  const list = records.filter((r) => scope.ids.includes(r.id));
  if (!list.length) return;
  $("#manage-title").textContent = `Manage ${scope.label}`;
  $("#manage-summary").textContent =
    `${list.length} original records · ${list.reduce((n, r) => n + r.quantity, 0)} units · ${[...new Set(list.map((r) => r.date))].join(", ")}`;
  const fields = [
    ["box", "Box Number", "text"],
    ["date", "Date of Inventory", "date"],
    ["type", "Sample type", "text"],
    ...(scope.kind === "batch"
      ? [["batchName", "Import / batch name", "text"]]
      : []),
  ];
  $("#bulk-fields").innerHTML = fields
    .map(([key, label, kind]) => {
      const values = [...new Set(list.map((r) => r[key] || ""))],
        value = values.length === 1 ? values[0] : "";
      return `<div class="bulk-field"><label class="check"><input type="checkbox" name="change-${key}">Change ${label}</label><input name="${key}" type="${kind}" value="${e(value)}" maxlength="${key === "batchName" ? 200 : 100}" placeholder="${values.length > 1 ? "Mixed values — check to overwrite" : ""}"></div>`;
    })
    .join("");
  $("#scope-records").innerHTML = sourceTable(sortOriginals(list), false);
  $("#manage-dialog").showModal();
}
$("#batches-open").onclick = () => {
  const batches = importBatches(records);
  $("#batch-list").innerHTML = batches.length
    ? dataTable(
        ["Import / batch", "Imported at", "Records", "Quantity", "Actions"],
        batches.map(
          (b) =>
            `<tr><td>${e(b.name)}</td><td>${e(b.createdAt) || "Not recorded"}</td><td>${b.records.length}</td><td>${b.quantity}</td><td><button data-manage-batch="${e(b.id)}">Edit / reimport / delete</button></td></tr>`,
        ),
      )
    : "<p>No saved imports or records.</p>";
  $("#batches-dialog").showModal();
};
$("#bulk-form").onsubmit = (event) => {
  event.preventDefault();
  try {
    const form = event.target,
      changes = {};
    for (const key of ["box", "date", "bundle", "type", "batchName"])
      if (form.elements[`change-${key}`]?.checked)
        changes[key] = form.elements[key].value;
    if (!Object.keys(changes).length)
      throw Error("Check at least one field to change.");
    if (
      !confirm(
        `Update ${management.ids.length} records in ${management.label}? Quantities and remarks will be kept.`,
      )
    )
      return;
    persist(updateScope(records, management.ids, changes));
    $("#manage-dialog").close();
    notice("Selected records updated. Undo is available until refresh.");
  } catch (err) {
    alert(err.message);
  }
};
$("#delete-scope").onclick = () => {
  try {
    if (
      !confirm(
        `Delete all ${management.ids.length} original records in ${management.label}? This includes records hidden by search and date-range filters.`,
      )
    )
      return;
    persist(records.filter((r) => !management.ids.includes(r.id)));
    $("#manage-dialog").close();
    notice("Selected records deleted. Undo is available until refresh.");
  } catch (err) {
    alert(err.message);
  }
};
$("#undo").onclick = () => {
  try {
    if (!undoRecords) return;
    localStorage.setItem(KEY, JSON.stringify(undoRecords));
    records = undoRecords;
    undoRecords = null;
    render();
    notice("Last inventory change undone.");
  } catch (err) {
    notice(err.message, true);
  }
};
render();
if (loadError) notice(loadError, true);
