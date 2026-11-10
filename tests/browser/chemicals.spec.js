import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
const initialRegistry = JSON.parse(
  await readFile("src/chemicals/preloaded-records.json", "utf8"),
).registry;
test.beforeEach(async ({ page }) => {
  await page.addInitScript((registry) => {
    if (localStorage.getItem("shemberg-qa-chemicals-v1") === null)
      localStorage.setItem(
        "shemberg-qa-chemicals-v1",
        JSON.stringify({
          schema: 1,
          bottles: [],
          events: [],
          registry,
          registryEvents: [],
        }),
      );
  }, initialRegistry);
});
async function register(page, standard = false) {
  if (standard) await page.locator("[data-nav=standard]").click();
  await page.locator("#add-bottle").click();
  if (standard) await page.locator("[name=bottleId]").fill("STD-001");
  await page
    .locator("[name=name]")
    .fill(standard ? "Sodium hydroxide" : "Acetic acid");
  await page.locator("[name=analyst]").fill("Jermaine");
  await page.locator("[name=lot]").fill("LOT-2026");
  await page.locator("[name=supplier]").fill("Lab supplier");
  await page.locator("[name=storage]").fill("AR");
  await page.locator("[name=classification]").fill("organic acid");
  if (standard) {
    await page.locator("[name=concentration]").fill("0.1000 N");
    await page.locator("[name=standardDate]").fill("2026-01-01");
    await page.locator("[name=restandardDate]").fill("2026-02-01");
  } else {
    await page.locator("[name=unit]").selectOption("mL");
    await page.locator("[name=density]").fill("1.05");
  }
  await page.locator("[name=minimum]").fill("100");
  await page.locator("[name=capacity]").fill("1000");
  await page.locator("[name=method]").selectOption("volume");
  await page.locator("[name=amount]").fill("500");
  await page
    .locator("#modal")
    .getByRole("button", { name: "Register bottle", exact: true })
    .click();
  await expect(page.locator("#modal")).not.toBeVisible();
}
async function withdrawal(page) {
  await page.locator("[data-withdraw]").first().click();
  await page.locator("[name=amount]").fill("105");
  await page.locator("[name=unit]").selectOption("g");
  await page.locator("[name=analyst]").fill("QA analyst");
  await page.locator("[name=reason]").fill("Acidity test, batch 72");
  await page
    .getByRole("button", { name: "Record withdrawal", exact: true })
    .click();
  await expect(page.locator(".stock-amount")).toContainText("400");
}
async function bytes(download) {
  const stream = await download.createReadStream(),
    chunks = [];
  for await (const c of stream) chunks.push(c);
  return Buffer.concat(chunks);
}
test("chemicals register, withdraw, persist, filter, standardize, export and restore", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/chemicals.html");
  await page.locator("[data-nav=catalog]").click();
  await expect(page.locator("#catalog-rows tr")).toHaveCount(172);
  await page.locator("#catalog-search").fill("Hydrochl");
  await expect(page.locator("#catalog-rows")).toContainText("Hydrochlric Acid");
  await page.locator("[data-nav=raw]").click();
  await register(page);
  await withdrawal(page);
  await page.reload();
  await expect(page.locator(".stock-amount")).toContainText("400");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator("[data-withdraw]")).toBeVisible();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("#storage-filter").selectOption("AR");
  await page.locator("#category-filter").selectOption("Acids");
  await expect(
    page.locator(".inventory-table tbody tr:has([data-withdraw])"),
  ).toHaveCount(1);
  await page.locator("[data-detail]").first().click();
  await page.locator("#detail-inventory").click();
  await page.locator("[name=method]").selectOption("gross");
  await page.locator("[name=amount]").fill("650");
  await page.locator("[name=tare]").fill("230");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Physical check");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".stock-amount")).toContainText("400");
  await page.locator("#export-open").click();
  for (const format of ["xlsx", "pdf", "docx", "csv"]) {
    const wait = page.waitForEvent("download");
    await page.locator(`[data-format=${format}]`).click();
    const d = await wait;
    const data = await bytes(d);
    expect(data.length).toBeGreaterThan(200);
    if (format === "xlsx") {
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(data);
      const sheet = wb.getWorksheet("Inventory");
      const stockRow = sheet
        .getRows(5, sheet.rowCount - 4)
        .find((r) => r.getCell(2).value === "Acetic acid");
      expect(stockRow.getCell(4).value).toBe("400 mL");
      expect(sheet.getRow(4).values.slice(1)).toEqual([
        "Code",
        "Chemical / solution",
        "Bottle ID",
        "Quantity",
        "Storage",
        "Lot / batch",
        "Expiration",
        "Status",
      ]);
      expect(wb.worksheets.map((w) => w.name)).toEqual(["Inventory"]);
    }
    if (format === "pdf") expect(data.subarray(0, 5).toString()).toBe("%PDF-");
    if (format === "docx") expect(data.subarray(0, 2).toString()).toBe("PK");
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await register(page, true);
  await expect(page.locator(".badge-cell")).toContainText(
    "Restandardization due",
  );
  await page.locator("[data-detail]").first().click();
  await page.locator("#detail-standard").click();
  await page.locator("[name=concentration]").fill("0.1002 N");
  await page.locator("[name=standardDate]").fill("2026-11-06");
  await page.locator("[name=restandardDate]").fill("2027-02-06");
  await page.locator("[name=analyst]").fill("QA2");
  await page.locator("[name=reason]").fill("Titration STD-09");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator(".concentration")).toHaveText("0.1002 N");
  await page.locator("[data-nav=log]").click();
  await page.locator("#log-action").selectOption("Withdrawal");
  await expect(page.locator(".log-table tbody tr")).toHaveCount(1);
  await expect(page.locator("#log-table")).toContainText(
    "Acidity test, batch 72",
  );
  await page.locator("[data-nav=backup]").click();
  const wait = page.waitForEvent("download");
  await page.locator("#backup-download").click();
  const backup = await bytes(await wait);
  expect(JSON.parse(backup).bottles).toHaveLength(2);
  await page.locator("#restore-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.locator("#confirm-restore").check();
  await page.locator("#do-restore").click();
  await expect(page.locator("#toast")).toContainText("restored");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("single-file chemicals app runs with no external resources", async ({
  page,
}) => {
  const html = await readFile(
      "standalone/Shemberg-Chemicals-Inventory.html",
      "utf8",
    ),
    external = [];
  await page.route("**/*", (route) => {
    if (route.request().url() === "http://chemicals-offline.test/")
      return route.fulfill({ contentType: "text/html", body: html });
    external.push(route.request().url());
    return route.abort();
  });
  await page.goto("http://chemicals-offline.test/");
  await register(page);
  await withdrawal(page);
  await page.reload();
  await expect(page.locator(".stock-amount")).toContainText("400");
  await page.locator("#export-open").click();
  for (const format of ["xlsx", "pdf", "docx"]) {
    const wait = page.waitForEvent("download");
    await page.locator(`[data-format=${format}]`).click();
    expect((await bytes(await wait)).length).toBeGreaterThan(500);
  }
  expect(external).toEqual([]);
});

test("failed storage write cannot reduce stock or append a withdrawal", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  await register(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("Storage full", "QuotaExceededError");
    };
  });
  await page.locator("[data-withdraw]").click();
  await page.locator("[name=amount]").fill("100");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Assay");
  await page
    .getByRole("button", { name: "Record withdrawal", exact: true })
    .click();
  await expect(page.locator("#dialog-error")).toContainText("Storage full");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await expect(page.locator(".stock-amount")).toContainText("500");
  await page.reload();
  await expect(page.locator(".stock-amount")).toContainText("500");
  await page.locator("[data-nav=log]").click();
  await expect(page.locator(".log-table")).not.toContainText("Withdrawal");
  await expect(page.locator(".log-table")).toContainText("Registered");
});

test("locator stocks are the default raw list and accept quantities without reentering metadata", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  await expect(page.locator("[data-default-stock]")).toHaveCount(172);
  await expect(page.locator(".stock-amount")).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("Raw chemicals");
  await page.locator("#search-chem").fill("Hydrochlric");
  await expect(page.locator(".inventory-table tbody tr")).toHaveCount(1);
  await expect(page.locator(".inventory-table")).toContainText("HCl");
  await expect(page.locator(".inventory-table")).toContainText("AR");
  await expect(page.locator(".quantity-missing")).toHaveText("Not entered");
  await page
    .getByRole("button", { name: "Enter quantity", exact: true })
    .click();
  await page.locator("#quantity-form [name=unit]").selectOption("mL");
  await page.locator("#quantity-form [name=amount]").fill("750");
  await page.locator("#quantity-form [name=analyst]").fill("Jermaine");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(page.locator(".stock-amount")).toHaveText("750 mL");
  await page.reload();
  await expect(page.locator("[data-default-stock]")).toHaveCount(171);
  await expect(page.locator(".stock-amount")).toHaveText("750 mL");
  await page.locator("[data-detail]").first().click();
  await expect(page.locator(".detail-grid")).toContainText("7647-01-0");
  await expect(page.locator(".detail-grid")).toContainText("AR");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("[data-withdraw]").click();
  await page.locator("[name=amount]").fill("50");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Prepare test solution");
  await page
    .getByRole("button", { name: "Record withdrawal", exact: true })
    .click();
  await expect(page.locator(".stock-amount")).toHaveText("700 mL");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("tracing update keeps legacy data, groups old stock and records gross-only withdrawal", async ({
  page,
}) => {
  const legacy = {
    schema: 1,
    bottles: [
      {
        id: "legacy-bottle",
        section: "raw",
        bottleId: "OLD STOCK RAW-009",
        name: "Legacy sodium hydroxide",
        unit: "g",
        balance: null,
        gross: 500,
        tare: null,
        density: null,
        minimum: 20,
        capacity: 1000,
        analyst: "Jermaine",
        received: "2026-01-01",
        expiry: "",
        standardDate: "",
        restandardDate: "",
        classification: "strong base",
      },
    ],
    events: [
      {
        id: "legacy-event",
        bottleKey: "legacy-bottle",
        bottleId: "OLD STOCK RAW-009",
        name: "Legacy sodium hydroxide",
        section: "raw",
        unit: "g",
        at: "2026-01-03T08:00:00.000Z",
        type: "Registered",
        before: null,
        after: null,
        quantity: null,
        analyst: "Jermaine",
        reason: "Initial physical inventory",
      },
    ],
  };
  const offlineHtml = await readFile(
    "standalone/Shemberg-Chemicals-Inventory.html",
    "utf8",
  );
  await page.route("**/*", (r) =>
    r.request().isNavigationRequest() &&
    r.request().url().endsWith("/chemicals.html")
      ? r.fulfill({ contentType: "text/html", body: offlineHtml })
      : r.abort(),
  );
  await page.goto("/chemicals.html");
  await page.evaluate(
    (s) => localStorage.setItem("shemberg-qa-chemicals-v1", JSON.stringify(s)),
    legacy,
  );
  await page.reload();
  const migrated = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(migrated.bottles[0].balance).toBeNull();
  expect(migrated.bottles[0].gross).toBe(500);
  expect(migrated.events[0]).toEqual(legacy.events[0]);
  await page.locator("#search-chem").fill("Legacy sodium");
  await page.getByRole("button", { name: "Active", exact: true }).click();
  await expect(page.locator("[data-withdraw]")).toHaveCount(0);
  await page.getByRole("button", { name: "Old stock", exact: true }).click();
  await expect(page.locator("[data-withdraw]")).toHaveCount(1);
  await expect(page.locator(".inventory-table")).toContainText("Old stock");
  await page.locator("[data-detail]").first().click();
  await page.locator("#detail-edit").click();
  await page.locator("[name=phase]").selectOption("Solid");
  await expect(page.locator("[name=density]")).not.toBeVisible();
  await expect(page.locator("[name=densityTemp]")).not.toBeVisible();
  await page.locator("[name=formulaWeight]").fill("40");
  await page.locator("[name=labCode]").fill("QA-LAB-77");
  await expect(page.locator("[name=internalCode]")).toHaveAttribute(
    "readonly",
    "",
  );
  const generatedCode = await page.locator("[name=internalCode]").inputValue();
  await page.locator("[name=opened]").fill("2026-04-20");
  await page.locator("[name=openedBy]").fill("Jermaine");
  await page.locator("[name=reason]").fill("Add bottle traceability");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page.locator("[data-withdraw]").click();
  await expect(page.locator("[name=withdrawalMode]")).toHaveValue("gross");
  await page.locator("[name=weightBefore]").fill("500");
  await page.locator("[name=weightAfter]").fill("480");
  await page.locator("[name=sameContainer]").check();
  await page.locator("[name=analyst]").fill("Jermaine");
  await page.locator("[name=reason]").fill("Assay run QA-77");
  await page
    .getByRole("button", { name: "Record withdrawal", exact: true })
    .click();
  await expect(page.locator("#modal")).not.toBeVisible();
  await expect(page.locator(".inventory-table")).toContainText(
    "Last gross weight: 480 g",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(saved.events[0]).toEqual(legacy.events[0]);
  expect(saved.bottles[0].id).toBe("legacy-bottle");
  expect(saved.bottles[0].balance).toBeNull();
  expect(saved.bottles[0].gross).toBe(480);
  expect(saved.events.find((e) => e.type === "Withdrawal").quantity).toBe(20);
  expect(saved.bottles[0].openedBy).toBe("Jermaine");
  await page.reload();
  await page.locator("#search-chem").fill("QA-LAB-77");
  await expect(page.locator("[data-withdraw]")).toHaveCount(1);
  await page.locator("#export-open").click();
  const wait = page.waitForEvent("download");
  await page.locator("[data-format=xlsx]").click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await bytes(await wait));
  const sheet = wb.getWorksheet("Inventory");
  const values = sheet.getRow(5).values;
  expect(values).toContain(generatedCode);
  expect(values).toContain("Not entered");
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Inventory"]);
});

test("liquid density temperature and solid mass-only entry are available in quantity forms", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  await page.locator("#search-chem").fill("Acetic Acid");
  await page
    .getByRole("button", { name: "Enter quantity", exact: true })
    .first()
    .click();
  await page.locator("[name=phase]").selectOption("Solid");
  await expect(page.locator("[name=density]")).not.toBeVisible();
  await expect(page.locator("[name=unit] option[value=mL]")).toHaveAttribute(
    "disabled",
    "",
  );
  await page.locator("[name=phase]").selectOption("Liquid");
  await page
    .locator(".form-details summary")
    .filter({ hasText: "Container, lot and stock settings" })
    .click();
  await expect(page.locator("[name=density]")).toBeVisible();
  await page.locator("[name=unit]").selectOption("mL");
  await page.locator("[name=density]").fill("1.05");
  await page.locator("[name=densityTemp]").fill("20");
  await page.locator("[name=amount]").fill("250");
  await page.locator("[name=analyst]").fill("JT");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await page.locator("[data-detail]").first().click();
  await expect(page.locator(".detail-grid")).toContainText(
    "1.05 g/mL at 20 °C",
  );
});

test("registry create/edit, category exports and disposal archive keep records and restore from backup", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const html = await readFile(
    "standalone/Shemberg-Chemicals-Inventory.html",
    "utf8",
  );
  await page.route("**/*", (r) =>
    r.request().isNavigationRequest()
      ? r.fulfill({ contentType: "text/html", body: html })
      : r.abort(),
  );
  await page.goto("http://registry-offline.test/");
  await page.locator("[data-nav=catalog]").click();
  await page.locator("#new-chemical").click();
  await page.locator("[name=name]").fill("Registry test acid");
  await page.locator("[name=formula]").fill("C2H4O2");
  await page.locator("[name=cas]").fill("64-19-7");
  await page.locator("[name=classification]").fill("organic acid");
  await page.locator("[name=storage]").fill("AR");
  await page.locator("[name=formulaWeight]").fill("60.05");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("New reagent received");
  await page
    .getByRole("button", { name: "Save chemical", exact: true })
    .click();
  await expect(page.locator("#catalog-rows tr")).toHaveCount(173);
  await page.locator("[data-nav=raw]").click();
  await page.locator("#search-chem").fill("Registry test acid");
  await page
    .getByRole("button", { name: "Enter quantity", exact: true })
    .click();
  await page.locator("[name=amount]").fill("500");
  await page.locator("[name=analyst]").fill("JT");
  await page
    .getByRole("button", { name: "Save quantity", exact: true })
    .click();
  await expect(page.locator(".stock-amount")).toHaveText("500 g");
  await page.locator("[data-nav=catalog]").click();
  await page.locator("#catalog-search").fill("Registry test acid");
  await page
    .getByRole("button", { name: "Edit chemical", exact: true })
    .click();
  await page.locator("[name=name]").fill("Registry acid corrected");
  await page.locator("[name=analyst]").fill("QA2");
  await page.locator("[name=reason]").fill("Confirm bottle label");
  await page
    .getByRole("button", { name: "Save chemical", exact: true })
    .click();
  await page.locator("[data-nav=raw]").click();
  await page.locator("#search-chem").fill("Registry acid corrected");
  await expect(page.locator(".stock-amount")).toHaveText("500 g");
  await page.locator("#search-chem").fill("");
  await page.locator("#export-open").click();
  await page.locator("[name=exportCategory]").selectOption("Acids");
  await page
    .locator("summary")
    .filter({ hasText: "Choose inventory columns" })
    .click();
  await page.locator("[data-report-field=classification]").check();
  let wait = page.waitForEvent("download");
  await page.locator("[data-format=xlsx]").click();
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await bytes(await wait));
  const ws = wb.getWorksheet("Inventory");
  expect(ws.rowCount).toBeGreaterThan(5);
  const names = ws
    .getRows(5, ws.rowCount - 4)
    .map((r) => String(r.getCell(2).value || ""))
    .filter(Boolean);
  expect(names).toContain("Registry acid corrected");
  const col = ws.getRow(4).values.indexOf("Classification");
  for (const r of ws
    .getRows(5, ws.rowCount - 4)
    .filter((r) => r.getCell(2).value))
    expect(String(r.getCell(col).value)).toMatch(/acid/i);
  expect(wb.worksheets.map((w) => w.name)).toEqual(["Inventory"]);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("#search-chem").fill("Registry acid corrected");
  await page.locator("[data-disposition]").click();
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Contamination suspected");
  await page
    .getByRole("button", { name: "Save disposal record", exact: true })
    .click();
  await expect(page.locator(".stock-amount")).toHaveText("500 g");
  await expect(page.locator(".badge-cell")).toContainText(
    "Suggested for disposal",
  );
  await page.locator("[data-disposition]").click();
  await expect(page.locator("[name=status]")).toHaveValue("archived");
  await page.locator("[name=analyst]").fill("JT");
  await page
    .locator("[name=reason]")
    .fill("Disposed through lab waste collection");
  await page.locator("[name=reference]").fill("DISP-2026-09");
  await page.locator("[name=confirm]").check();
  await page
    .getByRole("button", { name: "Save disposal record", exact: true })
    .click();
  await expect(page.locator("[data-withdraw]")).toHaveCount(0);
  await expect(page.locator("[data-default-stock]")).toHaveCount(0);
  await page.locator("[data-nav=archive]").click();
  await expect(page.locator(".inventory-table")).toContainText(
    "Registry acid corrected",
  );
  await expect(page.locator("[data-withdraw]")).toHaveCount(0);
  await page.locator("[data-detail]").first().click();
  await expect(page.locator(".detail-grid")).toContainText("500 g");
  await expect(page.locator(".log-table")).toContainText("Disposed");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("[data-nav=backup]").click();
  wait = page.waitForEvent("download");
  await page.locator("#backup-download").click();
  const backup = await bytes(await wait),
    data = JSON.parse(backup);
  expect(
    data.registry.filter((c) => c.name === "Registry acid corrected"),
  ).toHaveLength(1);
  expect(
    data.registryEvents.filter(
      (e) =>
        ["Chemical added", "Chemical edited"].includes(e.type) &&
        e.chemicalId ===
          data.registry.find((c) => c.name === "Registry acid corrected").id,
    ),
  ).toHaveLength(2);
  expect(data.bottles[0].disposal.previousBalance).toBe(500);
  await page.locator("#restore-file").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.locator("#confirm-restore").check();
  await page.locator("#do-restore").click();
  await page.reload();
  await page.locator("[data-nav=archive]").click();
  await expect(page.locator(".inventory-table")).toContainText(
    "Registry acid corrected",
  );
  await page.locator("[data-nav=catalog]").click();
  await page.locator("#catalog-search").fill("Registry acid corrected");
  await expect(page.locator("#catalog-rows tr")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("unmeasured default stock can be suggested for disposal and suggestion can be cleared", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  await page.locator("#search-chem").fill("Hydrochlric");
  await page
    .getByRole("button", { name: "Suggest disposal", exact: true })
    .click();
  await expect(page.locator("[name=bottleId]")).toHaveAttribute("readonly", "");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Old unidentified amount");
  await page
    .getByRole("button", { name: "Save disposal record", exact: true })
    .click();
  await expect(page.locator(".badge-cell")).toContainText(
    "Suggested for disposal",
  );
  await expect(page.locator(".stock-amount")).toContainText("Not entered");
  await page.locator("[data-disposition]").click();
  await page.locator("[name=status]").selectOption("normal");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Label verified for continued use");
  await page
    .getByRole("button", { name: "Save disposal record", exact: true })
    .click();
  await expect(page.locator(".badge-cell")).not.toContainText(
    "Suggested for disposal",
  );
});

test("offline previous-entry suggestions reuse suppliers and people without changing saved records", async ({
  page,
}) => {
  const html = await readFile(
    "standalone/Shemberg-Chemicals-Inventory.html",
    "utf8",
  );
  await page.route("**/*", (r) =>
    r.request().isNavigationRequest()
      ? r.fulfill({ contentType: "text/html", body: html })
      : r.abort(),
  );
  await page.goto("http://suggestions-offline.test/");
  await register(page);
  const saved = await page.evaluate(() =>
    localStorage.getItem("shemberg-qa-chemicals-v1"),
  );
  await page.locator("#add-bottle").click();
  const suggestions = async (name) =>
    page
      .locator(`[name=${name}]`)
      .evaluate((input) =>
        [...(input.list?.options || [])].map((o) => o.value),
      );
  expect(await suggestions("supplier")).toContain("Lab supplier");
  expect(await suggestions("storage")).toContain("AR");
  expect(await suggestions("analyst")).toContain("Jermaine");
  expect(await suggestions("openedBy")).toContain("Jermaine");
  expect(await suggestions("lot")).toContain("LOT-2026");
  await expect(page.locator("[name=supplier]")).toHaveValue("");
  await expect(page.locator("[name=bottleId]")).not.toHaveAttribute("list");
  await expect(page.locator("[name=amount]")).not.toHaveAttribute("list");
  await expect(page.locator("[name=received]")).not.toHaveAttribute("list");
  await page.locator("[name=supplier]").fill("Unsaved Supplier");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(
    await page.evaluate(() => localStorage.getItem("shemberg-qa-chemicals-v1")),
  ).toBe(saved);
  await page.locator("#add-bottle").click();
  expect(await suggestions("supplier")).not.toContain("Unsaved Supplier");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await withdrawal(page);
  await page.locator("[data-withdraw]").first().click();
  expect(await suggestions("reason")).toContain("Acidity test, batch 72");
  await expect(page.locator("[name=reason]")).toHaveValue("");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.locator("[data-nav=standard]").click();
  await page.locator("#add-bottle").click();
  expect(await suggestions("supplier")).toContain("Lab supplier");
  expect(await suggestions("analyst")).toContain("QA analyst");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.reload();
  await page.locator("#add-bottle").click();
  expect(await suggestions("supplier")).toContain("Lab supplier");
  await expect(page.locator("[name=bottleId]")).toHaveAttribute("readonly", "");
  await page.locator("[name=name]").fill("New custom chemical");
  await page.locator("[name=supplier]").fill("Another supplier");
  await page.locator("[name=analyst]").fill("Jermaine");
  await page.locator("[name=amount]").fill("100");
  await page
    .locator("#modal")
    .getByRole("button", { name: "Register bottle", exact: true })
    .click();
  await page.locator("#add-bottle").click();
  expect(await suggestions("supplier")).toEqual(
    expect.arrayContaining(["Another supplier", "Lab supplier"]),
  );
  const current = JSON.parse(
    await page.evaluate(() => localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(current.bottles[0].bottleId).toMatch(/^RAW-\d+$/);
  expect(current.bottles[0].balance).toBe(400);
  expect(current.bottles[0].supplier).toBe("Lab supplier");
});

test("live import numbering, readable selected reports, bottle overview and reversible deletion preserve data", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const html = await readFile(
    "standalone/Shemberg-Chemicals-Inventory.html",
    "utf8",
  );
  await page.route("**/*", (r) =>
    r.request().isNavigationRequest()
      ? r.fulfill({ contentType: "text/html", body: html })
      : r.abort(),
  );
  await page.goto("http://latest-update.test/");
  await register(page);
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1"));
    s.bottles[0].internalCode = "QA-00990";
    let master = s.registry.find((c) => c.id === s.bottles[0].catalogId);
    if (!master) {
      master = { ...s.bottles[0], id: s.bottles[0].catalogId };
      s.registry.push(master);
    }
    master.internalCode = "QA-00990";
    s.registryEvents.push({
      ...s.registryEvents.at(-1),
      id: "test-running-code-event",
      chemicalId: master.id,
      snapshot: { ...master },
    });
    localStorage.setItem("shemberg-qa-chemicals-v1", JSON.stringify(s));
  });
  await page.reload();
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  await page.locator("[data-nav=catalog]").click();
  await page.locator("#import-registry").click();
  await expect(page.locator("#next-code")).toHaveText("Next code: QA-00991");
  await page.locator("#registry-import-file").setInputFiles({
    name: "list.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Chemical name,Formula,CAS,Classification,Storage\nImport test acid,HCl,7647-01-0,inorganic acid,AR\nImport test base,NaOH,1310-73-2,strong base,AR",
    ),
  });
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Delivery list");
  await page.locator("#preview-registry").click();
  await expect(page.locator("#registry-import-preview")).toContainText(
    "QA-00992",
  );
  expect(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
    ),
  ).toEqual(before);
  await page.locator('[data-import-row="0"]').uncheck();
  await page.locator("#apply-registry-import").click();
  await page.reload();
  await page.locator("[data-nav=catalog]").click();
  await page.locator("#catalog-search").fill("Import test base");
  await expect(page.locator("#catalog-rows")).toContainText("QA-00992");
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet("Registry").addRows([
    ["Chemical name", "Formula", "CAS", "Classification", "Storage"],
    ["Import test base", "NaOH", "1310-73-2", "strong base", "AR"],
    ["Import second salt", "NaCl", "7647-14-5", "inorganic salt", "WR"],
  ]);
  const file = await workbook.xlsx.writeBuffer();
  await page.locator("#import-registry").click();
  await expect(page.locator("#next-code")).toHaveText("Next code: QA-00993");
  await page.locator("#registry-import-file").setInputFiles({
    name: "new.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: Buffer.from(file),
  });
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Second delivery");
  await page.locator("#preview-registry").click();
  await expect(page.locator('[data-import-row="0"]')).toBeDisabled();
  await page.locator("#apply-registry-import").click();
  await page.locator("#catalog-search").fill("Acetic acid");
  const existing = page
    .locator("#catalog-rows tr")
    .filter({ hasText: "QA-00990" });
  await existing.locator("[data-register]").click();
  const secondId = await page.locator("[name=bottleId]").inputValue();
  await page.locator("[name=unit]").selectOption("g");
  await page.locator("[name=method]").selectOption("mass");
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=lot]").fill("LOT-2026");
  await page.locator("[name=amount]").fill("250");
  await page
    .locator("#modal")
    .getByRole("button", { name: "Register bottle", exact: true })
    .click();
  const firstId = await page.evaluate(
    () =>
      JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")).bottles[0]
        .bottleId,
  );
  await page.locator("[data-nav=raw]").click();
  await page.locator("#search-chem").fill("LOT-2026");
  await page.locator("[data-layout=overview]").click();
  const overview = page.locator(".overview-table tbody tr");
  await expect(overview).toHaveCount(1);
  await expect(overview.locator("td").nth(1)).toHaveText("2");
  await expect(overview).toContainText("250 g; 500 mL");
  await overview.locator("[data-overview]").click();
  await expect(page.locator("#modal")).toContainText(firstId);
  await expect(page.locator("#modal")).toContainText(secondId);
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("#export-open").click();
  await page
    .locator("summary")
    .filter({ hasText: "Choose inventory columns" })
    .click();
  await page.locator("[data-report-field]").evaluateAll((es) =>
    es.forEach((e) => {
      e.checked = ["name", "quantity", "bottleId"].includes(
        e.dataset.reportField,
      );
      e.dispatchEvent(new Event("change", { bubbles: true }));
    }),
  );
  await page
    .locator("summary")
    .filter({ hasText: "Choose chemicals and bottles" })
    .click();
  await page.locator("#report-none").click();
  await page.locator("[data-report-row]").first().check();
  await expect(page.locator("#export-count")).toContainText("1 selected");
  let wait = page.waitForEvent("download");
  await page.locator("[data-format=xlsx]").click();
  const report = new ExcelJS.Workbook();
  await report.xlsx.load(await bytes(await wait));
  const sheet = report.getWorksheet("Inventory");
  expect(sheet.getRow(4).values.slice(1)).toEqual([
    "Chemical / solution",
    "Bottle ID",
    "Quantity",
  ]);
  expect(sheet.getRow(5).getCell(2).value).toBe(firstId);
  expect(sheet.getRow(5).getCell(3).value).toBe("500 mL");
  expect(report.worksheets).toHaveLength(1);
  await page.locator("#report-inventory").uncheck();
  await page.locator("#report-overview").check();
  await page.locator("#report-log").check();
  for (const format of ["pdf", "docx"]) {
    wait = page.waitForEvent("download");
    await page.locator(`[data-format=${format}]`).click();
    expect((await bytes(await wait)).length).toBeGreaterThan(500);
  }
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.locator("[data-layout=bottles]").click();
  const row = page
    .locator(".inventory-table tbody tr")
    .filter({ hasText: secondId });
  await row.locator("[data-remove]").click();
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Redundant bottle entry");
  await page.locator("[name=confirm]").check();
  await page
    .locator("#modal")
    .getByRole("button", { name: "Delete record", exact: true })
    .click();
  await expect(page.locator(".inventory-table")).not.toContainText(secondId);
  await page.locator("[data-nav=removed]").click();
  await expect(page.locator("h1")).toHaveText("Removed bottle records");
  await expect(page.locator(".inventory-table")).toContainText(secondId);
  await page.locator("[data-restore=true]").click();
  await page.locator("[name=analyst]").fill("JT");
  await page.locator("[name=reason]").fill("Restore verified bottle");
  await page
    .getByRole("button", { name: "Restore record", exact: true })
    .click();
  await page.locator("[data-nav=raw]").click();
  await page.locator("#search-chem").fill(secondId);
  await expect(page.locator(".stock-amount")).toHaveText("250 g");
  const current = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(current.bottles[0].balance).toBe(500);
  expect(current.events[0]).toEqual(before.events[0]);
  expect(
    current.registry
      .filter((c) => c.internalCode?.startsWith("QA-"))
      .map((c) => c.internalCode),
  ).toEqual(["QA-00990", "QA-00992", "QA-00993"]);
  expect(errors).toEqual([]);
});

test("legacy bottle gets a two-year review flag without being marked expired", async ({
  page,
}) => {
  await page.goto("/chemicals.html");
  await register(page);
  await page.locator("[data-detail]").first().click();
  await page.locator("#detail-edit").click();
  await page.locator("[name=received]").fill("2020-01-01");
  await page
    .locator("#bottle-form summary")
    .filter({ hasText: "Shelf-life review settings" })
    .click();
  await expect(page.locator("[name=shelfLifeMonths]")).toHaveValue("24");
  await page.locator("[name=reason]").fill("Add receipt date");
  await page
    .getByRole("button", { name: "Save correction", exact: true })
    .click();
  await page.locator("#status-filter").selectOption("shelf");
  await expect(page.locator(".badge-cell")).toContainText(
    "Shelf-life review due",
  );
  await expect(page.locator(".badge-cell")).not.toContainText("Expired");
  await page.locator("[data-detail]").first().click();
  await expect(page.locator(".detail-grid")).toContainText("2022-01-01");
  await page.getByRole("button", { name: "Close dialog" }).click();
  await page.reload();
  await page.locator("#status-filter").selectOption("shelf");
  await expect(page.locator("[data-withdraw]")).toHaveCount(1);
});

test("backup updater preserves old records; group buttons and copied bottles use correct fraction labels", async ({
  page,
}) => {
  const { emptyState, register } = await import("../../src/chemicals/core.js");
  let original = emptyState();
  for (const [i, label] of [
    [1, "1/2"],
    [2, "2/2"],
  ])
    original = register(
      original,
      {
        section: "raw",
        catalogId: "locator-77",
        sourceRow: 77,
        name: "Thymolphthalein",
        formula: "C₂₈H₃₀O₄",
        cas: "125-20-2",
        stockGroup: "old",
        bottleId: label,
        internalCode: "OLS STOCK CHEM-077",
        unit: "g",
        phase: "Solid",
        analyst: "QA analyst",
        supplier: "Example supplier",
        lot: "LOT-" + i,
        storage: "Cab A",
        received: "2026-01-01",
        opened: "2026-01-02",
        openedBy: "QA analyst",
      },
      { method: "mass", amount: 100 * i },
    );
  const updater = await readFile(
      "standalone/Shemberg-Backup-Updater.html",
      "utf8",
    ),
    html = await readFile(
      "standalone/Shemberg-Chemicals-Inventory.html",
      "utf8",
    ),
    requests = [];
  await page.route("**/*", (r) => {
    if (r.request().isNavigationRequest())
      return r.fulfill({
        contentType: "text/html",
        body: r.request().url().endsWith("/app") ? html : updater,
      });
    requests.push(r.request().url());
    return r.abort();
  });
  await page.goto("http://numbering-update.test/");
  await page.locator("#backup").setInputFiles({
    name: "main-backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(original)),
  });
  await expect(page.locator("#message")).toContainText("2 bottle records kept");
  const wait = page.waitForEvent("download");
  await page.locator("#download").click();
  const backup = await bytes(await wait),
    updated = JSON.parse(backup);
  expect(updated.bottles.map((b) => b.bottleId)).toEqual([
    "1/2 RAW-077",
    "2/2 RAW-077",
  ]);
  expect(updated.events.slice(0, 2)).toEqual(original.events);
  expect(updated.bottles.map((b) => b.balance)).toEqual([100, 200]);
  expect(updated.bottles.map((b) => b.id)).toEqual(
    original.bottles.map((b) => b.id),
  );
  expect(
    updated.registry.filter((c) => c.id.startsWith("inventory-2026-11")),
  ).toHaveLength(33); // Iron(II) chloride is already present in this synthetic baseline.
  await page.goto("http://numbering-update.test/app");
  await page.locator("[data-nav=backup]").click();
  await page.locator("#restore-file").setInputFiles({
    name: "updated.json",
    mimeType: "application/json",
    buffer: backup,
  });
  await page.locator("#confirm-restore").check();
  await page.locator("#do-restore").click();
  await page.locator("[data-nav=raw]").click();
  await page.locator("#search-chem").fill("Thymolphthalein");
  await expect(page.locator(".inventory-table")).toContainText(
    "OLD STOCK CHEM-077",
  );
  await page
    .locator("[data-stock-change][data-target-group=active]")
    .first()
    .click();
  await page.locator("[name=analyst]").fill("QA2");
  await page.locator("[name=reason]").fill("Verified as active");
  await page.locator("#group-form button[type=submit]").click();
  let saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(saved.bottles.every((b) => b.internalCode === "CHEM-077")).toBe(true);
  expect(saved.bottles.map((b) => b.balance)).toEqual([100, 200]);
  await page.locator("[data-register]").first().click();
  await expect(page.locator("[name=bottleId]")).toHaveValue("3/3 RAW-077");
  await expect(page.locator("[name=bottleId]")).toHaveAttribute("readonly", "");
  await expect(page.locator("[name=supplier]")).toHaveValue("Example supplier");
  await expect(page.locator("[name=lot]")).toHaveValue("LOT-1");
  await expect(page.locator("[name=amount]")).toHaveValue("");
  await expect(page.locator("[name=opened]")).toHaveValue("");
  await expect(page.locator("[name=tare]")).toHaveValue("");
  await page.locator("[name=supplier]").fill("Different supplier");
  await page.locator("[name=lot]").fill("NEW-LOT");
  await page.locator("[name=amount]").fill("50");
  await page.locator("#bottle-form button[type=submit]").click();
  await expect(page.locator("#modal")).not.toBeVisible();
  saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("shemberg-qa-chemicals-v1")),
  );
  expect(saved.bottles.map((b) => b.bottleId)).toEqual([
    "1/3 RAW-077",
    "2/3 RAW-077",
    "3/3 RAW-077",
  ]);
  expect(saved.bottles.map((b) => b.balance)).toEqual([100, 200, 50]);
  expect(saved.bottles[2].supplier).toBe("Different supplier");
  expect(saved.bottles[0].supplier).toBe("Example supplier");
  expect(new Set(saved.bottles.map((b) => b.containerCode)).size).toBe(3);
  expect(saved.events.slice(0, 2)).toEqual(original.events);
  await page
    .locator("[data-stock-change][data-target-group=old]")
    .first()
    .click();
  await page.locator("[name=analyst]").fill("QA2");
  await page.locator("[name=reason]").fill("Return to old stock");
  await page.locator("#group-form button[type=submit]").click();
  await expect(page.locator(".inventory-table")).toContainText(
    "OLD STOCK CHEM-077",
  );
  expect(requests).toEqual([]);
});
