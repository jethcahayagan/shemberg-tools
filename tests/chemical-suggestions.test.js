import { test } from "node:test";
import assert from "node:assert/strict";
import { savedSuggestions } from "../src/chemicals/suggestions.js";

test("saved values, snapshots and archived suppliers are reused without changing records", () => {
  const state = {
    schema: 1,
    bottles: [
      {
        supplier: " Old Supplier ",
        storage: "Cab 1",
        analyst: "Jermaine",
        openedBy: "Analyst B",
        labCode: "QA-7",
        balance: 500,
        disposalStatus: "archived",
      },
      { supplier: "old supplier", storage: "Cab 2", lot: "LOT-1" },
    ],
    events: [
      {
        type: "Details corrected",
        snapshot: { supplier: "New Supplier" },
        previous: { supplier: "Historic Supplier" },
        analyst: "QA2",
        reason: "Label correction",
      },
    ],
    registry: [{ name: "Acetic acid", classification: "organic acid" }],
  };
  const unchanged = structuredClone(state),
    s = savedSuggestions(state, [{ name: "Sodium chloride", storage: "AR" }]);
  assert.deepEqual(s.supplier, [
    "Historic Supplier",
    "New Supplier",
    "old supplier",
  ]);
  assert.deepEqual(s.storage, ["AR", "Cab 1", "Cab 2"]);
  assert.deepEqual(s.analyst, ["Analyst B", "Jermaine", "QA2"]);
  assert.deepEqual(s.openedBy, s.analyst);
  assert.deepEqual(s.labCode, ["QA-7"]);
  assert.deepEqual(s.name, ["Acetic acid", "Sodium chloride"]);
  assert.deepEqual(s.lot, ["LOT-1"]);
  assert.equal(s.bottleId, undefined);
  assert.equal(s.internalCode, undefined);
  assert.equal(s.balance, undefined);
  assert.deepEqual(state, unchanged);
});

test("reasons stay relevant to withdrawal, disposal, correction and registry forms", () => {
  const state = {
    bottles: [{ reason: "Stale bottle reason" }],
    events: [
      { type: "Withdrawal", reason: "Acidity test", analyst: "JT" },
      { type: "Physical inventory", reason: "Monthly weighing" },
      { type: "Disposed", reason: "Expired stock" },
      { type: "Details corrected", reason: "Updated label" },
    ],
    registryEvents: [
      { reason: "SDS reference verified", snapshot: { name: "Acetic acid" } },
    ],
  };
  assert.deepEqual(savedSuggestions(state, [], "Withdrawal").reason, [
    "Acidity test",
  ]);
  assert.deepEqual(savedSuggestions(state, [], "Physical inventory").reason, [
    "Monthly weighing",
  ]);
  assert.deepEqual(savedSuggestions(state, [], "Disposal record").reason, [
    "Expired stock",
  ]);
  assert.deepEqual(
    savedSuggestions(state, [], "Correct bottle details").reason,
    ["Updated label"],
  );
  assert.deepEqual(savedSuggestions(state, [], "Add chemical").reason, [
    "SDS reference verified",
  ]);
  assert.deepEqual(
    savedSuggestions(state, [], "Register raw chemical bottle").reason,
    [],
  );
});

test("empty values are ignored and text is preserved as data", () => {
  const state = {
    bottles: [
      { supplier: "", labCode: null, storage: "   " },
      { supplier: "<script>alert(1)</script>", labCode: 123 },
    ],
    events: [],
  };
  const s = savedSuggestions(state);
  assert.deepEqual(s.supplier, ["<script>alert(1)</script>"]);
  assert.deepEqual(s.labCode, []);
  assert.deepEqual(s.storage, []);
});
