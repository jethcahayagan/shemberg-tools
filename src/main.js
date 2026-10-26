import "./style.css";
import {
  normalize,
  boxKey,
  summarize,
  duplicateFlags,
  collator,
} from "./core.js";
import {
  reportModel,
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
const defaultLogo = await fetch(`${import.meta.env.BASE_URL}shemberg-logo.png`)
  .then((r) => r.blob())
  .then(
    (blob) =>
      new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      }),
  )
  .catch(() => "");
let records = [],
  logo = defaultLogo,
  sessionAt = new Date().toISOString(),
  editing = null,
  preview = [],
  flags = [],
  loadError = "";
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
app.innerHTML = `<aside class="sidebar"><a class="brand" href="#"><img class="brand-logo" src="${import.meta.env.BASE_URL}shemberg-logo.png" alt="Shemberg"><span><small>INVENTORY WORKSPACE</small></span></a><div class="nav-label">WORKSPACE</div><a class="nav active" href="#inventory">▦ <span>Inventory overview</span></a><a class="nav" href="#products">◈ <span>Product summary</span></a><a class="nav" href="#tools">⇅ <span>Import & reports</span></a><div class="sidebar-bottom"><span class="status-dot"></span> Stored on this browser<small>Export regularly to keep a backup.</small></div></aside><main><header><div class="breadcrumb">Workspace <span>/</span> Toothpaste inventory</div><div class="session"><span class="status-dot"></span><span id="session-label"></span><button id="new-session" class="text-button">New session</button></div></header><section class="page-title" id="inventory"><div><div class="eyebrow">WAREHOUSE OPERATIONS</div><h1>Toothpaste inventory</h1><p>A clear view of every product, one box at a time.</p></div><button class="primary" id="add">＋ Add inventory</button></section><div id="notice" role="status" aria-live="polite"></div><section class="metrics" id="metrics"></section><section class="panel tools" id="tools"><div><h2>Inventory workspace</h2><p>Consolidated by box, inventory date, and product code.</p></div><div class="actions"><label class="button">↑ Import file<input id="import-file" type="file" accept=".csv,.xlsx" hidden></label><button id="import-format" title="Import format and CSV template">Template</button><button id="preview-report">Report preview</button><button id="export-open" class="dark">↓ Export report</button></div></section><section class="panel filters"><label class="search"><span>⌕</span><input id="search" placeholder="Search products, boxes, or remarks…" aria-label="Search inventory"></label><label>Box<select id="box-filter"><option value="all">All boxes</option></select></label><label>From<input type="date" id="from"></label><label>To<input type="date" id="to"></label><label>Sort within box<select id="sort"><option value="date">Date, then product</option><option value="code">Product, then date</option><option value="quantity">Quantity, high to low</option></select></label><button id="reset">Reset</button></section><div class="list-meta"><span id="shown"></span><span>BOX-FIRST VIEW <span class="tag">Auto-consolidated</span></span></div><section id="boxes"></section><section class="panel products" id="products"><div class="section-heading"><div><h2>Overall product summary</h2><p>Totals across the current filtered inventory.</p></div></div><div id="product-table"></div></section><section class="panel branding"><div><h2>Your Shemberg branding</h2><p>Upload the official logo for the application and all reports. PNG, JPEG, or AVIF, up to 2 MB.</p></div><div class="actions"><img id="logo-preview" alt="Uploaded Shemberg logo" hidden><label class="button">Upload logo<input id="logo-file" type="file" accept="image/png,image/jpeg,image/avif" hidden></label><button id="remove-logo">Reset logo</button></div></section><footer><span>SHEMBERG · INVENTORY MANAGEMENT</span><span>Local storage · No account required</span></footer></main>
<dialog id="record-dialog"><form id="record-form"><div class="dialog-heading"><div><div class="eyebrow">INVENTORY RECORD</div><h2 id="form-title">Add inventory</h2></div><button type="button" data-close="record-dialog" aria-label="Close">✕</button></div><div class="form-grid"><label>Inventory date<input name="date" type="date" required></label><label>Sample date (optional)<input name="sampleDate" type="date"></label><label>Box number<input name="box" maxlength="100" placeholder="e.g. 001 — blank if unassigned"></label><label>Product code<input name="code" maxlength="100" required placeholder="TP001"></label><label>Quantity (units)<input name="quantity" type="number" min="0" max="9007199254740991" step="1" required></label><label class="wide">Product description<input name="description" maxlength="500" required placeholder="Toothpaste product name"></label><label class="wide">Remarks<textarea name="remarks" maxlength="2000" rows="3" placeholder="Condition, bundles, or counting notes"></textarea></label></div><p class="hint">Inventory date is the stock-count date. The session timestamp is recorded separately and preserved when editing.</p><div class="dialog-actions"><button type="button" data-close="record-dialog">Cancel</button><button class="primary" type="submit">Save record</button></div></form></dialog>
<dialog id="import-dialog" class="large"><div class="dialog-heading"><div><div class="eyebrow">REVIEW BEFORE SAVING</div><h2>Import preview</h2></div><button data-close="import-dialog" aria-label="Close">✕</button></div><p id="import-summary"></p><p class="hint">Possible duplicates match date, product, description, quantity, box, and remarks. Review before confirming. Source session timestamps are preserved when available.</p><label class="check"><input id="skip-duplicates" type="checkbox" checked> Skip possible duplicates</label><div id="import-preview" class="scroll"></div><div class="dialog-actions"><button data-close="import-dialog">Cancel</button><button id="confirm-import" class="primary">Confirm import</button></div></dialog>
<dialog id="report-dialog" class="large"><div class="dialog-heading"><div><div class="eyebrow">REPORT CENTER</div><h2>Inventory report preview</h2></div><button data-close="report-dialog" aria-label="Close">✕</button></div><p class="hint">Reports use your current search and filters, always sorted by box, date, and product. Original entries and overall product totals are included.</p><div class="actions report-actions"><button data-export="xlsx">↓ Excel (.xlsx)</button><button data-export="docx">↓ Word (.docx)</button><button data-export="pdf" class="primary">↓ PDF</button></div><div id="report-content"></div></dialog>
<dialog id="help-dialog"><h2>Import inventory</h2><p>Choose a CSV or Excel (.xlsx) file with these headers:</p><p class="hint">Inventory Date, Sample Date (optional), Product Code, Product Description, Quantity, Box Number, Remarks</p><p>Use YYYY-MM-DD dates. Blank box numbers remain unassigned. Excel reports from this application import the Original Records worksheet to avoid double counting.</p><div class="dialog-actions"><button id="template">Download CSV template</button><button data-close="help-dialog">Close</button></div></dialog>`;
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
      (from === "" || r.date >= from) &&
      (to === "" || r.date <= to) &&
      [r.code, r.description, r.box, r.remarks].some((s) =>
        s.toLowerCase().includes(q),
      ),
  );
}
function dataTable(headers, rows) {
  return `<div class="table-scroll"><table><thead><tr>${headers.map((h) => `<th>${e(h)}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table></div>`;
}
function sourceTable(sources, editable = true) {
  return dataTable(
    [
      "Inventory date",
      "Sample date",
      "Box",
      "Product",
      "Description",
      "Quantity",
      "Remarks",
      "Session timestamp",
      ...(editable ? ["Actions"] : []),
    ],
    sources.map(
      (r) =>
        `<tr><td>${e(r.date)}</td><td>${e(r.sampleDate) || "—"}</td><td>${e(r.box) || "UNASSIGNED BOX"}</td><td>${e(r.code)}</td><td>${e(r.description)}</td><td>${r.quantity}</td><td class="remarks">${e(r.remarks) || "—"}</td><td>${e(r.sessionAt || "Not recorded")}</td>${editable ? `<td class="row-actions"><button data-edit="${e(r.id)}">Edit</button><button data-delete="${e(r.id)}" class="danger">Delete</button></td>` : ""}</tr>`,
    ),
  );
}
function boxHTML(b, editable = true, sort = "date") {
  const rows = [...b.rows];
  if (sort === "code")
    rows.sort(
      (a, b) =>
        collator.compare(a.code, b.code) || a.date.localeCompare(b.date),
    );
  if (sort === "quantity")
    rows.sort(
      (a, b) =>
        b.quantity - a.quantity ||
        a.date.localeCompare(b.date) ||
        collator.compare(a.code, b.code),
    );
  return `<article class="panel box"><div class="box-heading"><div class="box-icon">▣</div><h2>${b.key ? `BOX NO. ${e(b.label)}` : "UNASSIGNED BOX"}</h2><span class="tag neutral">${b.rows.length} consolidated ${b.rows.length === 1 ? "record" : "records"}</span><span class="box-units">${b.total.toLocaleString()} <small>units</small></span></div>${dataTable(
    [
      "Inventory date",
      "Product code",
      "Product description",
      "Quantity",
      "Remarks / original entries",
    ],
    rows.map(
      (r) =>
        `<tr><td>${e(r.date)}</td><td><span class="code">${e(r.code)}</span></td><td>${e(r.descriptions.join(" / "))}</td><td class="quantity">${r.quantity.toLocaleString()}</td><td class="remarks"><details><summary>${r.sources.length} source ${r.sources.length === 1 ? "entry" : "entries"} <span>${e(r.remarks.join(" · ")) || "No remarks"}</span></summary>${sourceTable(r.sources, editable)}</details></td></tr>`,
    ),
  )}<div class="box-footer"><span>BOX TOTAL</span><strong>${b.total.toLocaleString()} units</strong></div></article>`;
}
function render() {
  const old = $("#box-filter").value;
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
    ["Unique products", s.products.length, "Across selected inventory"],
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
    ? s.boxes.map((b) => boxHTML(b, true, $("#sort").value)).join("") +
      `<div class="grand-total"><span>GRAND TOTAL <small>Current filtered inventory</small></span><strong>${s.quantity.toLocaleString()} units</strong></div>`
    : `<div class="panel empty"><div class="empty-icon">▣</div><h2>${records.length ? "No matching inventory" : "Your inventory starts here"}</h2><p>${records.length ? "Adjust your search or filters to find records." : "Add your first count or import a spreadsheet to organize stock by box."}</p><button class="primary" id="empty-add">＋ Add inventory</button><button id="import-help">Import format & template</button></div>`;
  $("#product-table").innerHTML = s.products.length
    ? dataTable(
        ["Product code", "Product description", "Total quantity"],
        s.products.map(
          (p) =>
            `<tr><td><span class="code">${e(p.code)}</span></td><td>${e([...p.descriptions].join(" / "))}</td><td class="quantity">${p.quantity.toLocaleString()}</td></tr>`,
        ),
      )
    : '<p class="hint">Product totals will appear when inventory is added.</p>';
  $("#session-label").textContent =
    `Session: ${new Date(sessionAt).toLocaleString()}`;
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
  for (const key of [
    "date",
    "sampleDate",
    "code",
    "description",
    "quantity",
    "box",
    "remarks",
  ])
    f.elements[key].value =
      record?.[key] ?? (key === "date" ? localDate() : "");
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
for (const id of ["search", "box-filter", "from", "to", "sort"])
  $("#" + id).addEventListener(id === "search" ? "input" : "change", render);
$("#reset").onclick = () => {
  for (const id of ["search", "from", "to"]) $("#" + id).value = "";
  $("#box-filter").value = "all";
  $("#sort").value = "date";
  render();
};
$("#import-file").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    preview = await readInventoryFile(file);
    if (!preview.length) throw Error("No inventory records found.");
    if (preview.length > 50000)
      throw Error("Import at most 50,000 records per file.");
    flags = duplicateFlags(records, preview);
    $("#skip-duplicates").checked = true;
    $("#import-summary").textContent =
      `${preview.length} valid original records · ${flags.filter(Boolean).length} possible duplicates · Nothing has been saved yet.`;
    $("#import-preview").innerHTML = dataTable(
      [
        "Status",
        "Inventory date",
        "Sample date",
        "Code",
        "Description",
        "Quantity",
        "Box",
        "Remarks",
      ],
      preview.map(
        (r, i) =>
          `<tr class="${flags[i] ? "duplicate" : ""}"><td>${flags[i] ? "Possible duplicate" : "New"}</td><td>${e(r.date)}</td><td>${e(r.sampleDate) || "—"}</td><td>${e(r.code)}</td><td>${e(r.description)}</td><td>${r.quantity}</td><td>${e(r.box) || "UNASSIGNED"}</td><td>${e(r.remarks)}</td></tr>`,
      ),
    );
    $("#import-dialog").showModal();
  } catch (err) {
    notice(`Import failed: ${err.message}`, true);
  } finally {
    event.target.value = "";
  }
};
$("#confirm-import").onclick = () => {
  try {
    const incoming = preview
      .filter((_, i) => !$("#skip-duplicates").checked || !flags[i])
      .map((r) => ({
        ...r,
        id: crypto.randomUUID(),
        sessionAt: r.sessionAt || sessionAt,
        importedAt: new Date().toISOString(),
      }));
    persist([...records, ...incoming]);
    $("#import-dialog").close();
    preview = [];
    notice(`Imported ${incoming.length} original records.`);
  } catch (err) {
    notice(err.message, true);
  }
};
$("#template").onclick = () =>
  saveBlob(
    new Blob(
      [
        "Inventory Date,Sample Date,Product Code,Product Description,Quantity,Box Number,Remarks\r\n2026-10-24,2025-07-28,LB-2210,LB-2210 sample,5,1 (Brown),Clear gel\r\n",
      ],
      { type: "text/csv" },
    ),
    "shemberg-import-template.csv",
  );
function openReport() {
  const m = reportModel(filtered(), logo);
  $("#report-content").innerHTML =
    `${logo ? `<img class="report-logo" src="${logo}" alt="Shemberg logo">` : ""}<h2>SHEMBERG · Toothpaste inventory</h2><p>Report generated: ${e(m.generatedAt)}</p><p>${m.boxCount} assigned boxes · ${m.products.length} unique products · ${m.originalCount} original records · ${m.consolidatedCount} consolidated records</p><details><summary>Inventory session timestamps (${m.sessions.length})</summary>${m.sessions.map((s) => `<p>${e(s)}</p>`).join("")}</details>${m.boxes.map((b) => boxHTML(b, false)).join("")}<h2>GRAND TOTAL: ${m.quantity.toLocaleString()} units</h2><h3>Overall product summary</h3>${dataTable(
      ["Product", "Description", "Quantity"],
      m.products.map(
        (p) =>
          `<tr><td>${e(p.code)}</td><td>${e([...p.descriptions].join(" / "))}</td><td>${p.quantity}</td></tr>`,
      ),
    )}<h3>Original records</h3>${sourceTable(m.records, false)}<h2>GRAND TOTAL: ${m.quantity.toLocaleString()} units</h2>`;
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
render();
if (loadError) notice(loadError, true);
