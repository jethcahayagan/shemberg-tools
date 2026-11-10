import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
const seed = JSON.parse(
  await readFile("src/chemicals/preloaded-records.json", "utf8"),
);
const KEY = "shemberg-qa-chemicals-v1";
async function state(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}
test("downloaded app opens the supplied records and updated list automatically, then saves an editable complete copy", async ({
  page,
}) => {
  let html = await readFile(
    "standalone/Shemberg-Chemicals-Inventory.html",
    "utf8",
  );
  const external = [],
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/*", (r) => {
    if (r.request().isNavigationRequest())
      return r.fulfill({ contentType: "text/html", body: html });
    external.push(r.request().url());
    return r.abort();
  });
  await page.goto("http://automatic-records.test/");
  await page.locator("[data-nav=catalog]").click();
  await expect(page.locator("#catalog-rows tr")).toHaveCount(172);
  const loaded = await state(page);
  expect(loaded.bottles).toHaveLength(52);
  expect(loaded.events.slice(0, seed.events.length)).toEqual(seed.events);
  expect(loaded.registryEvents.slice(0, seed.registryEvents.length)).toEqual(
    seed.registryEvents,
  );
  for (const old of seed.bottles) {
    const b = loaded.bottles.find((b) => b.id === old.id);
    for (const key of [
      "balance",
      "gross",
      "tare",
      "supplier",
      "lot",
      "labCode",
      "formula",
      "formulaWeight",
      "received",
      "expiry",
      "opened",
      "openedBy",
    ])
      expect(b[key]).toEqual(old[key]);
  }
  await page.locator("[data-nav=raw]").click();
  await page.locator("[data-detail]").first().click();
  await page.locator("#detail-edit").click();
  await page.locator("#form-view").selectOption("all");
  await page.locator("[name=supplier]").fill("Portable app test supplier");
  await page.locator("[name=reason]").fill("Test editable saved copy");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await expect(page.locator("#modal")).not.toBeVisible();
  const edited = await state(page);
  expect(
    edited.bottles.some((b) => b.supplier === "Portable app test supplier"),
  ).toBe(true);
  await page.reload();
  expect((await state(page)).bottles).toEqual(edited.bottles);
  await page.locator("[data-nav=backup]").click();
  const waiting = page.waitForEvent("download");
  await page.locator("#save-personalized").click();
  const d = await waiting,
    stream = await d.createReadStream(),
    chunks = [];
  for await (const c of stream) chunks.push(c);
  html = Buffer.concat(chunks).toString();
  await page.goto("http://fresh-portable-app.test/");
  await page.locator("[data-nav=catalog]").click();
  await expect(page.locator("#catalog-rows tr")).toHaveCount(172);
  const portable = await state(page);
  expect(portable.bottles).toEqual(edited.bottles);
  expect(portable.events).toEqual(edited.events);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("newer browser records override bundled backup while automatic update keeps original history and recovery copy", async ({
  page,
}) => {
  const newer = structuredClone(seed);
  newer.bottles[0].supplier = "Latest local supplier";
  newer.bottles[0].balance = 123;
  const raw = JSON.stringify(newer);
  await page.addInitScript(
    ({ key, raw }) => {
      if (localStorage.getItem(key) === null) localStorage.setItem(key, raw);
    },
    { key: KEY, raw },
  );
  await page.goto("/chemicals.html");
  await page.locator("[data-nav=catalog]").click();
  await expect(page.locator("#catalog-rows tr")).toHaveCount(172);
  const updated = await state(page);
  expect(updated.bottles[0].supplier).toBe("Latest local supplier");
  expect(updated.bottles[0].balance).toBe(123);
  expect(updated.events.slice(0, newer.events.length)).toEqual(newer.events);
  const recovery = await page.evaluate(
    (key) => localStorage.getItem(key + "-before-2026-11-automatic-1"),
    KEY,
  );
  expect(recovery).toBe(raw);
  await page.reload();
  expect(await state(page)).toEqual(updated);
});
