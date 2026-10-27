import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalize,
  summarize,
  duplicateFlags,
  importRows,
  importBatches,
  replaceScope,
  updateScope,
} from "../src/core.js";
const row = (patch = {}) =>
  normalize({
    id: crypto.randomUUID(),
    date: "2026-10-24",
    sampleDate: "2025-06-01",
    code: "Sample-A",
    box: "1",
    quantity: 2,
    remarks: "Good",
    bundle: "Bundle-A",
    type: "gel",
    bundleStatus: "bundled",
    batchId: "batch-1",
    batchName: "Original sheet",
    ...patch,
  });
test("bundle, type, status, code, dates and box form strict consolidation boundaries; remarks retain quantities", () => {
  const a = row(),
    b = row({ quantity: 3, remarks: "Broken seal" }),
    c = row({ remarks: "Loose item", bundleStatus: "loose" }),
    d = row({ bundle: "Bundle-B" }),
    e = row({ type: "paste" }),
    f = row({ bundle: "" }),
    g = row({ bundle: "" }),
    h = row({ type: "" }),
    i = row({ type: "" });
  const s = summarize([a, b, c, d, e, f, g, h, i]);
  assert.equal(s.consolidatedCount, 8);
  assert.equal(s.quantity, 19);
  const combined = s.boxes[0].rows.find((r) => r.sources.length === 2);
  assert.equal(combined.quantity, 5);
  assert.deepEqual(combined.remarkBreakdown, [
    { remarks: "Good", quantity: 2, count: 1 },
    { remarks: "Broken seal", quantity: 3, count: 1 },
  ]);
  assert.equal(combined.sources[1].id, b.id);
});
test("every repeated remark and empty remark remains accounted for", () => {
  const s = summarize([
    row(),
    row({ quantity: 3 }),
    row({ quantity: 1, remarks: "" }),
  ]);
  const r = s.boxes[0].rows[0];
  assert.deepEqual(r.remarks, ["Good", "Good"]);
  assert.deepEqual(r.remarkBreakdown, [
    { remarks: "Good", quantity: 5, count: 2 },
    { remarks: "", quantity: 1, count: 1 },
  ]);
  assert.equal(r.sources.length, 3);
});
test("unknown legacy bundle/type never silently consolidates and duplicate fingerprints include tracking", () => {
  const a = row({ bundle: "", type: "" }),
    b = row({ bundle: "", type: "" });
  assert.equal(summarize([a, b]).consolidatedCount, 2);
  assert.deepEqual(
    duplicateFlags(
      [row()],
      [
        row(),
        row({ bundle: "Other" }),
        row({ type: "Other" }),
        row({ bundleStatus: "loose" }),
      ],
    ),
    [true, false, false, false],
  );
});
test("tracking columns import exactly and invalid status is rejected", () => {
  const rows = [
    [
      "Date",
      "Samples",
      "Quantity",
      "Bundle ID",
      "Sample Type",
      "Bundle Status",
      "Remarks",
    ],
    ["2025-06-01", "A", 3, "Known bundle", "gel", "loose", "Separated"],
  ];
  const [r] = importRows(rows, { inventoryDate: "2026-10-24" });
  assert.equal(r.bundle, "Known bundle");
  assert.equal(r.type, "gel");
  assert.equal(r.bundleStatus, "loose");
  assert.throws(
    () =>
      importRows(
        [
          ...rows.slice(0, 1),
          ["2025-06-01", "A", 3, "A", "gel", "invalid", ""],
        ],
        { inventoryDate: "2026-10-24" },
      ),
    /Bundle Status/,
  );
});
test("scope edits preserve originals and unrelated batches, replacements are atomic and reject empty input", () => {
  const a = row(),
    b = row({ box: "2", batchId: "batch-2" });
  const updated = updateScope([a, b], [a.id], {
    box: "1 corrected",
    bundle: "Corrected bundle",
    quantity: 999,
  });
  assert.equal(updated[0].box, "1 corrected");
  assert.equal(updated[0].quantity, a.quantity);
  assert.equal(updated[0].remarks, a.remarks);
  assert.equal(updated[1], b);
  assert.equal(a.box, "1");
  const replacement = row({ quantity: 8 });
  const next = replaceScope([a, b], [a.id], [replacement]);
  assert.deepEqual(next, [b, replacement]);
  assert.throws(
    () => replaceScope([a, b], [a.id], []),
    /Existing records were kept/,
  );
  assert.throws(
    () => replaceScope([a, b], ["missing"], [replacement]),
    /no longer exists/,
  );
  assert.equal(importBatches([a, b]).length, 2);
  assert.equal(
    importBatches([{ ...a, batchId: undefined }])[0].id,
    "__legacy__",
  );
});

test("loose samples only combine when their shared bundle origin and type are explicitly known", () => {
  const known = [
    row({ bundleStatus: "loose", quantity: 2, remarks: "Separated" }),
    row({ bundleStatus: "loose", quantity: 3, remarks: "Found loose" }),
  ];
  const r = summarize(known).boxes[0].rows[0];
  assert.equal(r.quantity, 5);
  assert.equal(r.sources.length, 2);
  assert.equal(r.remarkBreakdown[1].quantity, 3);
  assert.equal(
    summarize(known.map((r) => ({ ...r, bundle: "" }))).consolidatedCount,
    2,
  );
});
