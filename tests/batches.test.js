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
test("same code/date automatically becomes one bundle without a manual ID; type still separates detailed rows", () => {
  const records = [
    row({ bundle: "" }),
    row({ bundle: "Old label", remarks: "Broken packet", quantity: 3 }),
    row({ bundleStatus: "loose", remarks: "Found apart" }),
    row({ type: "paste" }),
    row({ type: "" }),
    row({ type: "" }),
  ];
  const s = summarize(records);
  assert.equal(s.consolidatedCount, 3);
  assert.equal(s.quantity, 13);
  const merged = s.boxes[0].rows.find((r) => r.type === "gel");
  assert.equal(merged.quantity, 7);
  assert.equal(merged.bundle, "SAMPLE-A · 2025-06-01");
  assert.equal(merged.sources.length, 3);
  assert.deepEqual(merged.remarkBreakdown, [
    { remarks: "Good", quantity: 2, count: 1 },
    { remarks: "Broken packet", quantity: 3, count: 1 },
    { remarks: "Found apart", quantity: 2, count: 1 },
  ]);
  assert.equal(merged.sources[1].originalBundle, "Old label");
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
test("automatic grouping includes missing manual IDs and preserves duplicate source-reference distinctions", () => {
  const a = row({ bundle: "", type: "" }),
    b = row({ bundle: "", type: "" });
  assert.equal(summarize([a, b]).consolidatedCount, 1);
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
    [true, false, false, true],
  );
});
test("tracking imports preserve IDs/types; historical status notes are retained without classifying new records", () => {
  const [r] = importRows(
    [
      ["Date", "Samples", "Quantity", "Bundle ID", "Sample Type", "Remarks"],
      ["2025-06-01", "A", 3, "Known group", "gel", "Separated"],
    ],
    { inventoryDate: "2026-10-24" },
  );
  assert.equal(r.bundle, "A · 2025-06-01");
  assert.equal(r.originalBundle, "Known group");
  assert.equal(r.type, "gel");
  assert.equal(r.bundleStatus, "");
  const a = row({ bundleStatus: "old label", remarks: "Apart" }),
    b = row({ bundleStatus: "other label", remarks: "In packet" });
  const s = summarize([a, b]);
  assert.equal(s.consolidatedCount, 1);
  assert.equal(s.boxes[0].rows[0].sources[0].bundleStatus, "old label");
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

test("remark wording and missing old bundle labels never stop automatic code/date grouping", () => {
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
    1,
  );
});
