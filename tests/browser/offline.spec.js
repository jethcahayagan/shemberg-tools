import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
test("standalone HTML needs no external resources and supports persistence and all exports", async ({
  page,
  context,
}) => {
  const errors = [],
    requests = [];
  page.on("pageerror", (e) => errors.push(e.message));
  // Managed cloud Chromium blocks file: navigation. Serve exactly the downloaded
  // HTML bytes through an intercepted document request; deny all other networking.
  const html = await readFile(
    resolve("standalone/Shemberg-Inventory.html"),
    "utf8",
  );
  await context.route(/^https?:/, (route) => {
    if (
      route.request().isNavigationRequest() &&
      route.request().url() === "http://127.0.0.1:5180/offline.html"
    )
      return route.fulfill({ contentType: "text/html", body: html });
    requests.push(route.request().url());
    return route.abort();
  });
  await page.goto("http://127.0.0.1:5180/offline.html");
  // A fresh browser profile isolates inventory from previous local HTML tests.
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText("Your inventory starts here")).toBeVisible();
  await page.locator("#add").click();
  for (const [name, value] of Object.entries({
    date: "2026-10-24",
    sampleDate: "2025-07-28",
    code: "LB-2210",
    description: "Toothpaste sample",
    quantity: "5",
    box: "1 (Brown)",
    remarks: "Clear gel",
  }))
    await page.locator(`[name=${name}]`).fill(value);
  await page.getByRole("button", { name: "Save record", exact: true }).click();
  await page.reload();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "5 units",
  );
  await page.locator("#preview-report").click();
  await expect(page.locator("#report-content .report-logo")).toBeVisible();
  for (const ext of ["xlsx", "docx", "pdf"]) {
    const pending = page.waitForEvent("download");
    await page.locator(`[data-export=${ext}]`).click();
    const download = await pending;
    const bytes = await readFile(await download.path());
    expect(bytes.subarray(0, ext === "pdf" ? 5 : 2).toString()).toBe(
      ext === "pdf" ? "%PDF-" : "PK",
    );
  }
  await page.locator("[data-close=report-dialog]").click();
  await page.locator("#import-file").setInputFiles({
    name: "sample.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Inventory Date,Product Code,Product Description,Quantity,Box Number,Remarks\n2026-10-24,TP2,Mint,3,,Loose\n",
    ),
  });
  await expect(page.locator("#import-summary")).toContainText(
    "1 valid original records",
  );
  await page.locator("#confirm-import").click();
  await expect(page.locator("#boxes .grand-total strong")).toHaveText(
    "8 units",
  );
  await expect(page.locator("#boxes")).toContainText("UNASSIGNED BOX");
  expect(errors).toEqual([]);
  expect(requests).toEqual([]);
});
