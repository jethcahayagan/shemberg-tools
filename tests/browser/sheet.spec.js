import { test, expect } from "@playwright/test";
test("sheet columns, original values, sample date consolidation, session isolation and original view", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  await page.locator("#entry-box").fill("1 (Brown)");
  await page.locator("#add").click();
  await expect(page.locator("[name=date]")).toHaveValue("2026-10-24");
  await expect(page.locator("[name=box]")).toHaveValue("1 (Brown)");
  await page.locator("[name=sampleDate]").fill("2025-06-01");
  await page.locator("[name=code]").fill("Mixed Sample");
  await page.locator("[name=quantity]").fill("2");
  await page.locator("[name=remarks]").fill("Original remark");
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  const csv =
    "Date,Samples,Quantity,Remarks\n2025-06-01,Mixed Sample,3,Second remark\n2025-06-02,Mixed Sample,4,Different day\n2025-05-01,Earlier sample,1,Oldest first\n";
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "sheet.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
  await expect(page.locator("#import-preview")).toContainText("1 (Brown)");
  await expect(page.locator("#import-preview")).toContainText("2026-10-24");
  await expect(page.locator("#import-summary")).toContainText(
    "3 valid original records",
  );
  await page.locator("#confirm-import").click();
  let box = page.locator("#boxes .box").first();
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr"),
  ).toHaveCount(3);
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr > td:first-child"),
  ).toHaveText(["2025-05-01", "2025-06-01", "2025-06-02"]);
  await expect(box.locator(".quantity")).toHaveText(["1", "5", "4"]);
  await box.locator("summary").nth(1).click();
  await expect(box.getByText("Original remark", { exact: true })).toBeVisible();
  await expect(box.getByText("Second remark", { exact: true })).toBeVisible();
  await expect(box.locator("details").nth(1).locator("tbody > tr")).toHaveCount(
    2,
  );
  await page.locator("#view").selectOption("original");
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr"),
  ).toHaveCount(4);
  await expect(
    box.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(4);
  await expect(box.getByText("Mixed Sample", { exact: true })).toHaveCount(3);
  await page.locator("#inventory-session-date").fill("2026-10-25");
  await page
    .locator("#import-file")
    .setInputFiles({
      name: "next-session.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(
        "Date,Samples,Quantity,Remarks\n2025-06-01,Mixed Sample,7,Recount next day\n",
      ),
    });
  await page.locator("#confirm-import").click();
  await page.locator("#view").selectOption("consolidated");
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr"),
  ).toHaveCount(4);
  await page.locator("#inventory-date-filter").selectOption("2026-10-24");
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "10 units",
  );
  await page.locator("#from").fill("2025-06-02");
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "4 units",
  );
  await page.locator("#preview-report").click();
  await expect(page.locator("#report-content")).toContainText("2025-06-02");
  await expect(page.locator("#report-content")).toContainText(
    "Dates of Inventory: 2026-10-24",
  );
});
