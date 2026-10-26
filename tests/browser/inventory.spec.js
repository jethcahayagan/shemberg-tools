import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { readFile } from "node:fs/promises";
test("data entry, persistence, filters, editing, imports, branded downloads and mobile layout", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
  async function add(qty, box = "001", remarks = "") {
    await page.locator("#add").click();
    await page.locator("[name=date]").fill("2026-10-24");
    await page.locator("[name=sampleDate]").fill("2025-03-26");
    await page.locator("[name=code]").fill("LB-2210");
    await page.locator("[name=description]").fill("Toothpaste sample");
    await page.locator("[name=quantity]").fill(String(qty));
    await page.locator("[name=box]").fill(box);
    await page.locator("[name=remarks]").fill(remarks);
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
  }
  await add(5, "001", "Bundle");
  await add(3, "001", "Broken");
  await add(4, "002", "Good");
  await add(2, "", "Loose");
  await expect(page.locator("#boxes .box")).toHaveCount(3);
  await expect(
    page.locator("#boxes .box").first().locator(".quantity"),
  ).toHaveText("8");
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "14 units",
  );
  await page.reload();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "14 units",
  );
  await page.locator("#boxes .box").first().locator("summary").click();
  await expect(
    page.locator("#boxes").getByText("Broken", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator("#boxes .box")
      .first()
      .locator("details")
      .getByText("2025-03-26", { exact: true }),
  ).toHaveCount(2);
  await page
    .locator("#boxes .box")
    .first()
    .getByRole("button", { name: "Edit", exact: true })
    .first()
    .click();
  await page.locator("[name=quantity]").fill("6");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "15 units",
  );
  await page.locator("#search").fill("Broken");
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "3 units",
  );
  await page.locator("#reset").click();
  const csv =
    "Inventory Date,Sample Date,Product Code,Product Description,Quantity,Box Number,Remarks\n2026-10-24,2025-03-26,LB-2210,Toothpaste sample,3,001,Broken\n2026-10-24,2025-03-26,TP002,Mint,2,010,New\n";
  await page.locator("#import-file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.locator("#import-summary")).toContainText(
    "1 possible duplicates",
  );
  await expect(page.locator("#boxes .box")).toHaveCount(3);
  await page.locator("#confirm-import").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "17 units",
  );
  await page.locator("#preview-report").click();
  await expect(page.locator("#report-content")).toContainText(
    "GRAND TOTAL: 17 units",
  );
  await expect(page.locator("#report-content .report-logo")).toBeVisible();
  const exports = {};
  for (const ext of ["xlsx", "docx", "pdf"]) {
    const promise = page.waitForEvent("download");
    await page.locator(`[data-export=${ext}]`).click();
    const download = await promise;
    const path = await download.path();
    exports[ext] = await readFile(path);
    expect(exports[ext].length).toBeGreaterThan(500);
    expect(exports[ext].subarray(0, ext === "pdf" ? 5 : 2).toString()).toBe(
      ext === "pdf" ? "%PDF-" : "PK",
    );
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(exports.xlsx);
  expect(wb.getWorksheet("Original Records").rowCount).toBe(6);
  expect(wb.getWorksheet("Product Summary").getRow(4).getCell(3).value).toBe(
    17,
  );
  await page.locator("[data-close=report-dialog]").click();
  await page.locator("#import-file").setInputFiles({
    name: "roundtrip.xlsx",
    mimeType:
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: exports.xlsx,
  });
  await expect(page.locator("#import-summary")).toContainText(
    "5 possible duplicates",
  );
  await page.locator("#confirm-import").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "17 units",
  );
  await page.locator("#boxes .box").first().locator("summary").click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator("#boxes .box")
    .first()
    .getByRole("button", { name: "Delete", exact: true })
    .first()
    .click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "11 units",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({ path: "/tmp/shemberg-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "/tmp/shemberg-desktop.png", fullPage: true });
  expect(errors).toEqual([]);
});
