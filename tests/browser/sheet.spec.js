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
  await page.locator("#import-file").setInputFiles({
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
  await box
    .locator(
      ":scope > .table-scroll > table > tbody > tr > td > details > summary",
    )
    .nth(1)
    .click();
  await expect(box.getByText("Original remark", { exact: true })).toBeVisible();
  await expect(box.getByText("Second remark", { exact: true })).toBeVisible();
  await expect(
    box
      .locator(":scope > .table-scroll > table > tbody > tr > td > details")
      .nth(1)
      .locator("tbody > tr"),
  ).toHaveCount(2);
  await page.locator("#view").selectOption("original");
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr"),
  ).toHaveCount(4);
  await expect(
    box.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(4);
  await expect(box.getByText("Mixed Sample", { exact: true })).toHaveCount(3);
  await page.locator("#inventory-session-date").fill("2026-10-25");
  await page.locator("#import-file").setInputFiles({
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

test("automatic bundle ID needs no manual assignment and no status controls", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator("#entry-status,#status-filter,[name=bundleStatus]"),
  ).toHaveCount(0);
  await page.locator("#entry-box").fill("1");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  for (const [quantity, remarks] of [
    [2, "Complete packet"],
    [3, "Separated items"],
  ]) {
    await page.locator("#add").click();
    await page.locator("[name=code]").fill("Auto-A");
    await page.locator("[name=sampleDate]").fill("2025-06-01");
    await expect(page.locator("[name=bundle],#entry-type")).toHaveCount(0);
    await page.locator("[name=quantity]").fill(String(quantity));
    await page.locator("[name=remarks]").fill(remarks);
    await page
      .getByRole("button", { name: "Save record", exact: true })
      .click();
  }
  await expect(page.locator("#boxes .quantity")).toHaveText("5");
  await page.locator("#boxes summary").first().click();
  await expect(page.locator("#boxes .remark-breakdown")).toContainText(
    "2 units",
  );
  await expect(page.locator("#boxes .remark-breakdown")).toContainText(
    "3 units",
  );
  await expect(page.locator("#boxes .remark-breakdown")).toContainText(
    "Separated items",
  );
  await page.reload();
  await expect(page.locator("#boxes .quantity")).toHaveText("5");
});

test("identical encoded source entries are kept by default and summed rather than discarded", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  await page.locator("#entry-box").fill("1");
  await page.locator("#import-file").setInputFiles({
    name: "repeat.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Samples,Quantity,Remarks\n2025-06-01,A,2,Same note\n2025-06-01,A,2,Same note\n",
    ),
  });
  await expect(page.locator("#import-summary")).toContainText(
    "1 possible duplicates",
  );
  await expect(page.locator("#skip-duplicates")).not.toBeChecked();
  await page.locator("#confirm-import").click();
  await expect(page.locator("#boxes .quantity")).toHaveText("4");
  await expect(page.locator("#boxes summary").first()).toContainText(
    "2 source entries",
  );
});

test("main view, original view, import preview and entry form keep the sheet format", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#entry-box").fill("1 (Brown)");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  await page.locator("#add").click();
  await expect(page.locator("[name=bundle]")).toHaveCount(0);
  await expect(page.locator("[name=type]")).not.toBeVisible();
  await expect(page.locator("[name=description]")).not.toBeVisible();
  await page.locator("[data-close=record-dialog]").first().click();
  await page.locator("#import-file").setInputFiles({
    name: "unsorted.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Date,Samples,Quantity,Remarks\n2025-07-01,B,1,Later\n2025-06-01,A,2,First part\n2025-06-01,A,3,Second part\n",
    ),
  });
  await expect(page.locator("#import-preview th")).toHaveText([
    "Date",
    "Samples",
    "Quantity",
    "Remarks",
  ]);
  await page.locator("#confirm-import").click();
  const box = page.locator("#boxes .box").first();
  await expect(
    box.locator(":scope > .table-scroll > table > thead th"),
  ).toHaveText(["Date", "Samples", "Quantity", "Remarks"]);
  await expect(box.locator(".sheet-caption")).toHaveText(
    "Date of Inventory: 2026-10-24",
  );
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr > td:first-child"),
  ).toHaveText(["2025-06-01", "2025-07-01"]);
  await expect(box.locator(".quantity")).toHaveText(["5", "1"]);
  await page.locator("#view").selectOption("original");
  await expect(
    box.locator(":scope > .table-scroll > table > thead th"),
  ).toHaveText(["Date", "Samples", "Quantity", "Remarks"]);
  await expect(
    box.locator(":scope > .table-scroll > table > tbody > tr"),
  ).toHaveCount(3);
});
