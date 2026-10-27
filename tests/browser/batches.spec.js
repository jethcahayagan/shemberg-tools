import { test, expect } from "@playwright/test";
const file = (name, text) => ({
  name,
  mimeType: "text/csv",
  buffer: Buffer.from(text),
});
const header = "Date,Samples,Quantity,Remarks,Bundle ID,Sample Type\n";
async function importBatch(page, name, text) {
  await page.locator("#import-file").setInputFiles(file(name, text));
  await page.locator("#confirm-import").click();
}
test("import batches and box operations support bulk correction, replacement, cancellation, deletion and undo", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  await page.locator("#entry-box").fill("1");
  await importBatch(
    page,
    "box-1.csv",
    header +
      "2025-06-01,A,2,Good,Group-A,gel\n2025-06-01,A,3,Broken seal,Group-A,gel\n2025-06-01,A,4,Separated,Group-A,gel\n",
  );
  await expect(page.locator("#boxes .quantity")).toHaveText(["9"]);
  await page.locator("#boxes summary").first().click();
  await expect(page.locator(".remark-breakdown").first()).toContainText(
    "2 units",
  );
  await expect(page.locator(".remark-breakdown").first()).toContainText(
    "3 units",
  );
  await page.locator("#entry-box").fill("2");
  await importBatch(
    page,
    "box-2.csv",
    header + "2025-06-01,B,7,Other box,Group-B,paste\n",
  );
  await page.locator("#batches-open").click();
  await expect(page.locator("#batch-list tbody tr")).toHaveCount(2);
  await page
    .locator("#batch-list tr")
    .filter({ hasText: "box-1.csv" })
    .getByRole("button")
    .click();
  await expect(page.locator("#manage-summary")).toContainText(
    "3 original records",
  );
  await page.locator("#bulk-form [name=change-box]").check();
  await page.locator("#bulk-form [name=box]").fill("1 (Corrected)");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Apply checked changes" }).click();
  await expect(page.locator("#boxes")).toContainText("BOX NO. 1 (Corrected)");
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "16 units",
  );
  await page.locator("#search").fill("Good");
  await page.locator('[data-manage-box="1 (CORRECTED)"]').click();
  await expect(page.locator("#manage-summary")).toContainText(
    "3 original records",
  );
  const corrected =
    header +
    "2025-06-01,A,6,Corrected quantity,Group-A,gel\n2025-06-01,A,1,Found loose,Group-A,gel\n";
  await page
    .locator("#replace-file")
    .setInputFiles(file("corrected.csv", corrected));
  await expect(page.locator("#import-summary")).toContainText(
    "REPLACE 3 existing records",
  );
  await page.locator("[data-close=import-dialog]").first().click();
  await expect(page.locator("#scope-records")).toContainText("Broken seal");
  await page
    .locator("#replace-file")
    .setInputFiles(file("corrected.csv", corrected));
  page.once("dialog", (d) => d.dismiss());
  await page.locator("#confirm-import").click();
  await expect(page.locator("#import-dialog")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.locator("#confirm-import").click();
  await page.locator("#reset").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "14 units",
  );
  await expect(page.locator("#boxes")).not.toContainText("Broken seal");
  await expect(page.locator("#boxes")).toContainText("Other box");
  await page.reload();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "14 units",
  );
  await page.locator('[data-manage-box="1 (CORRECTED)"]').click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#delete-scope").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "7 units",
  );
  await page.locator("#undo").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "14 units",
  );
  await page.locator("#batches-open").click();
  await page
    .locator("#batch-list tr")
    .filter({ hasText: "box-2.csv" })
    .getByRole("button")
    .click();
  page.once("dialog", (d) => d.accept());
  await page.locator("#delete-scope").click();
  await page.reload();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "7 units",
  );
  await expect(page.locator("#boxes")).not.toContainText("BOX NO. 2");
});
test("failed replacements and storage errors leave existing records intact", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator("#inventory-session-date").fill("2026-10-24");
  await page.locator("#entry-box").fill("1");
  await importBatch(
    page,
    "source.csv",
    header + "2025-06-01,A,5,Original,Group-A,gel\n",
  );
  await page.locator('[data-manage-box="1"]').click();
  page.once("dialog", (d) => d.accept());
  await page
    .locator("#replace-file")
    .setInputFiles(
      file("invalid.csv", "Date,Samples,Quantity\n2025-06-01,A,-1\n"),
    );
  await expect(page.locator("#scope-records")).toContainText("Original");
  await expect(page.locator("#import-dialog")).not.toBeVisible();
  await page
    .locator("#replace-file")
    .setInputFiles(
      file("valid.csv", header + "2025-06-01,A,8,Updated,Group-A,gel\n"),
    );
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "shemberg.inventory.v1")
        throw new DOMException("Storage full", "QuotaExceededError");
      return original.call(this, key, value);
    };
  });
  const dialogs = [];
  page.on("dialog", async (d) => {
    dialogs.push(d.message());
    await d.accept();
  });
  await page.locator("#confirm-import").click();
  await expect.poll(() => dialogs.length).toBe(2);
  await page.reload();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "5 units",
  );
  await expect(page.locator("#boxes")).toContainText("Original");
});
