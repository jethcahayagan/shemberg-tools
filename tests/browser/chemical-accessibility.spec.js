import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
const KEY = "shemberg-qa-chemicals-v1";
async function current(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), KEY);
}
async function downloadBytes(download) {
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}
test("larger type and simple menus preserve records and fit a phone; controls have large targets", async ({
  page,
}) => {
  const html = await readFile(
      "standalone/Shemberg-Chemicals-Inventory.html",
      "utf8",
    ),
    external = [];
  await page.route("**/*", (route) => {
    if (route.request().isNavigationRequest())
      return route.fulfill({ contentType: "text/html", body: html });
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto("http://comfortable-inventory.test/");
  const before = await current(page);
  await expect(page.locator("#filter-options")).not.toHaveAttribute("open");
  await expect(page.locator(".row-more").first()).not.toHaveAttribute("open");
  await page.locator("#text-size").selectOption("125");
  expect(
    await page.evaluate(() =>
      parseFloat(getComputedStyle(document.documentElement).fontSize),
    ),
  ).toBe(20);
  const small = await page
    .locator(
      "button:visible,select:visible,summary:visible,input:not([type=checkbox]):visible",
    )
    .evaluateAll((nodes) =>
      nodes
        .filter((node) => {
          const b = node.getBoundingClientRect();
          return b.width < 47.9 || b.height < 47.9;
        })
        .map((node) => ({
          text: node.textContent.slice(0, 45),
          tag: node.tagName,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })),
    );
  expect(small).toEqual([]);
  await page.locator("#filter-options summary").click();
  await page.locator("#storage-filter").selectOption("AR");
  await page.locator("#clear-filters").click();
  expect(await current(page)).toEqual(before);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator("#section-picker").selectOption("standard");
  await expect(page.locator("h1")).toHaveText("Standardized stocks");
  await page.locator("#section-picker").selectOption("raw");
  await expect(page.locator("h1")).toHaveText("Raw chemicals");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/shemberg-organized-mobile.png" });
  await page.reload();
  await page.locator(".settings-menu > summary").click();
  await expect(page.locator("#text-size")).toHaveValue("125");
  expect(await current(page)).toEqual(before);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/shemberg-organized-desktop.png" });
  expect(external).toEqual([]);
});
test("guided bottle registration validates each step, retains typed details on Back, and records exact quantity", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/chemicals.html");
  const before = await current(page);
  await page.locator("#add-bottle").click();
  await expect(page.locator(".form-step:visible > h3")).toHaveText(
    "Chemical details",
  );
  await page.locator("[data-step-next]").click();
  await expect(page.locator("[name=name]")).toBeFocused();
  await page.locator("[name=name]").fill("Accessibility test solid");
  await page.locator("[name=phase]").selectOption("Solid");
  await page.locator("[data-step-next]").click();
  await expect(page.locator(".form-step:visible > h3")).toHaveText(
    "Container and dates",
  );
  await page.locator("[name=supplier]").fill("Test supplier");
  await page.locator("[name=lot]").fill("LOT-EASY-1");
  await page.locator("[data-step-back]").click();
  await expect(page.locator("[name=name]")).toHaveValue(
    "Accessibility test solid",
  );
  await page.locator("[data-step-next]").click();
  await expect(page.locator("[name=supplier]")).toHaveValue("Test supplier");
  await page.locator("[data-step-next]").click();
  await expect(page.locator(".form-step:visible > h3")).toHaveText(
    "Quantity and record",
  );
  await expect(page.locator("[name=density]")).not.toBeVisible();
  await page.locator("[name=amount]").fill("125.12345678901234");
  await page.locator("[name=analyst]").fill("Test analyst");
  await page.locator("#bottle-form button[type=submit]").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  const after = await current(page);
  expect(after.bottles).toHaveLength(before.bottles.length + 1);
  expect(after.bottles.at(-1).balance).toBe(125.12345678901234);
  expect(after.bottles.at(-1).supplier).toBe("Test supplier");
  expect(after.events.slice(0, before.events.length)).toEqual(before.events);
  expect(errors).toEqual([]);
});
test("readable and full detail exports include context and exact data without modifying records", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  const before = await current(page);
  await page.locator("#search-chem").fill("RAW-077");
  await page.locator("#export-open").click();
  await page.locator("#report-log").check();
  let wait = page.waitForEvent("download");
  await page.locator("[data-format=xlsx]").click();
  const data = await downloadBytes(await wait),
    workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(data);
  const sheet = workbook.getWorksheet("Inventory");
  expect(sheet.getRow(2).getCell(1).value).toContain("search: RAW-077");
  expect(sheet.getRow(2).getCell(1).value).toContain(
    "App 2026.11.10-accessible.1",
  );
  expect(sheet.getRow(5).getCell(1).font.size).toBe(12);
  wait = page.waitForEvent("download");
  await page.locator("[data-format=fullcsv]").click();
  const exact = await downloadBytes(await wait),
    text = exact.toString();
  expect(text).toContain("Data.snapshot");
  expect(text).toContain("Data.balance");
  expect(text).toContain("App_version");
  expect(text).toContain("Activity");
  expect(text).toContain("RAW-077");
  for (const format of ["pdf", "docx"]) {
    wait = page.waitForEvent("download");
    await page.locator(`[data-format=${format}]`).click();
    expect((await downloadBytes(await wait)).length).toBeGreaterThan(1000);
  }
  expect(await current(page)).toEqual(before);
});

test("logbook export honors the selected action and preserves exact original events", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  const original = await current(page);
  const { transact } = await import("../../src/chemicals/core.js");
  const bottle = original.bottles.find((bottle) => bottle.gross > 1);
  const fixture = transact(original, bottle.id, {
    type: "Withdrawal",
    withdrawalMode: "gross",
    weightBefore: bottle.gross,
    weightAfter: bottle.gross - 0.123456789,
    sameContainer: true,
    analyst: "Export test analyst",
    reason: "CSV precision check",
  });
  await page.evaluate(
    ({ key, value }) => localStorage.setItem(key, JSON.stringify(value)),
    { key: KEY, value: fixture },
  );
  await page.reload();
  const before = await current(page);
  await page.locator("[data-nav=log]").click();
  await page.locator("#log-action").selectOption("Withdrawal");
  await page.locator("#export-log").click();
  await expect(page.locator("#report-log")).toBeChecked();
  await expect(page.locator("#report-inventory")).not.toBeChecked();
  const waiting = page.waitForEvent("download");
  await page.locator("[data-format=fullcsv]").click();
  const bytes = await downloadBytes(await waiting);
  const { Readable } = await import("node:stream");
  const wb = new ExcelJS.Workbook();
  const sheet = await wb.csv.read(Readable.from([bytes]), {
    map: (value) => value,
  });
  const headers = sheet.getRow(1).values.slice(1);
  const exported = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    expect(row.getCell(1).value).toBe("Activity");
    const record = {};
    headers.forEach((key, i) => {
      const value = row.getCell(i + 1).value;
      if (key.startsWith("Data.") && value !== null && value !== "")
        record[key.slice(5)] = JSON.parse(value);
    });
    exported.push(record);
  });
  expect(exported).toEqual(
    before.events.filter((event) => event.type === "Withdrawal"),
  );
  expect(await current(page)).toEqual(before);
});
