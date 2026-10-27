# Shemberg Sample Inventory

A working browser application for manually encoded toothpaste/sample inventories. The handwritten sheet is a **format reference only**: no photograph is transcribed, no unclear values are guessed, and no inventory is preloaded. The supplied official Shemberg logo is included, with an uploader for replacement branding.

## Download and use

Download **standalone/Shemberg-Inventory.html**, save it on your computer, and open it in a current Chrome, Edge or Firefox browser. This single file contains the app, styles, logo and Excel/Word/PDF libraries. No Node.js, server, installation or network connection is needed to use it.

Keep the HTML at the same file location and use the same browser profile. Browser storage is specific to the browser/site or local file location. Export unfiltered Excel backups regularly; moving the file, changing browsers or clearing browser data may show an empty inventory. The app is a local, single-browser workspace, without shared accounts or cloud synchronization.

## Correct an import, batch or box (v1.3)

Each new import is saved as a named batch, using the filename as its initial name. **Manage imports / batches** lists all saved batches with their timestamp, record count and quantity. Open a batch to edit shared information, replace it with a corrected CSV/Excel file, or delete it. Older and manually entered records without batch metadata appear under **Existing / manual records (batch unknown)**; their original import boundaries are not guessed.

Every box heading now has **Manage box**. This targets all originals for that box within the selected inventory session (or all inventory sessions if selected), including records hidden by a search or sample-date filter. The dialog shows the exact number and all affected originals. You can change the box label, inventory date, sample type. Check only the fields to overwrite; quantities, sample dates and complete remarks are kept. Batch names can be changed through batch management. To fix individual quantities or remarks, expand source entries or use Original records and click Edit.

**Reimport to replace** previews the corrected file and explicitly shows how many existing originals will be replaced. It excludes the target originals from duplicate detection, so unchanged rows in the correction are not accidentally treated as already saved. Replacement defaults to retaining all preview rows, including possible duplicates; review them before confirmation. Only the selected batch/box originals are removed; other records remain untouched. Box replacements must match that box and the selected inventory session. Use bulk edit first if renaming a box. File errors, cancellation, an empty replacement selection or failed storage writes leave existing records intact. Reimporting a backup as a new import creates a new named batch; original tracking columns remain in exported backups.

Delete requires confirmation of the full scope. **Undo last inventory change** restores one previous inventory state (add, edit, bulk edit, import, replacement or deletion) until the page is refreshed. Undo itself saves the restored records, but the undo history is not retained after refresh. Maintain Excel backups for longer-term recovery.

## Simple sheet format (v1.4)

The entry form, import preview, inventory view, original-records view and printed inventory tables follow **Date | Samples | Quantity | Remarks**. Box Number and Date of Inventory are shown above each table. Encode unsorted rows as written; the app sorts and consolidates them automatically. No extra bundle columns or labels are needed in the input file. Additional type/description fields are tucked inside an optional details section for existing data; there is no separate required type field in the normal sheet workflow.

In the consolidated view, expand Remarks to see the quantity associated with every remark, all original entries, and their Edit/Delete controls. The original-records view shows every source row directly. Edit, delete, box correction and reimport features are retained. Reports keep the same four-column format and include an original-record appendix for verification.

## Automatic bundles

Within a box and inventory session, **the same sample code and sample date automatically identify one bundle**. The app handles bundle grouping internally; no bundle ID or bundled/loose status is shown or required in the sheet format. This applies to manual entry, spreadsheet imports, saved records and every export. Missing manual IDs do not prevent consolidation. All original quantities and remarks remain accessible with a quantity/count breakdown per distinct remark.

**Sample Type**, when already present in a file or supplied through Additional details, is optional. If types are supplied, different types stay as separate detailed rows inside the same automatic bundle. Two blank types match without guessing a type. Different boxes, inventory dates and sample dates never consolidate. Sample-code matching is case-insensitive; the original spelling is preserved. Type matching retains exact values. Missing historical sample dates are labeled NOT RECORDED and kept separate rather than guessed.

Older manual bundle references remain preserved as **Original Bundle ID** in original records and backups. Historical status labels are retained only as legacy backup metadata; they are no longer controls, filters or consolidation criteria. Existing remarks, quantities, import batches and box-management features remain available. These changes can reduce the displayed consolidated-row count without changing any original quantity.

## Sheet workflow

1. Set **Box Number** and **Date of Inventory (session)** in the sheet header. The box may be blank; that explicitly means unassigned.
2. Add each handwritten row using **Date (sample date)**, **Samples (name or code)**, **Quantity** and **Remarks**. The session date and box are supplied as editable defaults. Description is optional, since the original sheet has only a Samples column.
3. Names/codes retain entered capitalization and remarks retain their complete text. No mandatory TP-style code or separate description is imposed. Sample dates are not replaced with the stock-count date.
4. Choose **Consolidated view** or **Original records**. Both group by box, then sort by sample date oldest first and natural alphanumeric sample name/code. Expand any consolidated row to inspect all original quantities, remarks, sample dates, inventory dates and entry timestamps. Edit/delete always affects an individual original record.
5. Filter by inventory session, box, sample-date range or search. If several inventory dates are selected, totals combine those selected sessions; filter to one session for a single stocktake. The sheet-header settings control new entry/import defaults, not report filters.
6. Preview and export the selected records as actual Excel, Word and PDF files.

### Consolidation rules

Combine the same **box + inventory session date + sample date + sample name/code + sample type** automatically. Bundle ID is calculated from sample code and date, not entered manually. Different sample dates and different provided types stay separate. Different inventory session dates and different boxes also stay separate. Every original source record, quantity and remark remains available. Different remarks are preserved together; descriptions remain in original records and overall sample summaries. Sample-code matching is case-insensitive while original capitalization is preserved.

Boxes sort naturally (1, 2, 10); unassigned stock is last under **UNASSIGNED BOX**. Numeric box aliases such as 001 and 1 identify the same box, retaining original labels in source records; text labels such as `1 (Brown)` and `1 (White)` remain separate. Legacy saved records with no sample date are labeled NOT RECORDED and never merged with another source record; no sample date is inferred from the inventory session date. New entry/import requires a valid sample date.

The report shows assigned-box count, unique-sample count, total quantity, original-record count and consolidated-record count. Unassigned inventory contributes to quantities and record counts, but not the assigned-box count. Every box has a subtotal and the report has a grand total. Overall sample summaries combine the selected records across boxes/dates for reference; they do not replace the dated detail.

### Dates and timestamps

- **Date of Inventory**: user-selected session/stock-count date from the sheet header.
- **Date**: the recorded date of each sample, used for detailed sorting and consolidation.
- **Entry timestamp**: automatically recorded when the record is entered or imported; editing preserves it. Start a new entry-time session with New session.
- **Report generated**: a separate timestamp recorded for each export, never substituted for the inventory date or sample date.

Dates are stored as YYYY-MM-DD. Exported timestamps use ISO UTC; the entry-session header uses the browser's local timezone.

## Import encoded CSV or Excel

The minimal spreadsheet structure matches the handwritten row columns:

| Date | Samples | Quantity | Remarks |
| ---- | ------- | -------- | ------- |

**Template** downloads a header-only CSV; it contains no photographed or invented inventory. Supply the shared **Box Number** and **Date of Inventory** using the app's sheet header before selecting a file. Optionally include per-row `Box Number` and `Date of Inventory` columns in the file; these override the defaults. An explicitly blank box cell stays unassigned, even when the sheet header has a box selected.

Description is optional. Additional supported columns: `Description`, `Entry Timestamp`. For compatibility, Product Code/Code/SKU map to Samples, Sample Date/Preparation Date map to Date, Inventory Date maps to Date of Inventory, and Qty, Box/Box No, Notes, Product Description and Session Timestamp also work. **An unqualified Date column always means sample date.** It is never interpreted as the inventory session date.

Use ISO dates or genuine Excel date cells. Format box-number cells as text to preserve leading zeros. CSV supports quoted commas, quotes and multiline remarks. Supported Excel format is .xlsx; save older .xls documents as .xlsx first. For general files, the first worksheet must contain the headers in its first row.

Review every row and possible duplicate before confirming. No data is saved until confirmation. Duplicates are detected against current records and within the file by both dates, box, sample name/code, quantity, description and complete remarks. Possible duplicates are kept by default so legitimate repeated source entries are never silently discarded. Check Skip confirmed duplicates only after verifying that the flagged rows truly repeat an already-counted entry. Different remarks remain distinct original records, even when they later consolidate. Invalid rows reject the import with a row number; no partial save occurs. Limits: 15 MB and 50,000 rows per import; browser storage capacity can be much smaller. A failed save leaves existing records unchanged.

Excel reports from this app automatically reimport the **Original Records** worksheet, preventing double counting of consolidated totals. Older backups with undated original records can be restored without guessing dates; those originals remain separate.

## Reports

Screen and reports share the same calculation functions. Default order is box, sample date, sample name/code, then inventory date as a tiebreaker. Alternate screen sorting does not change the report order. All formats include box headings/totals, source counts, complete remarks, a grand total, overall sample summary, original records, distinct inventory dates/entry timestamps/generation timestamp and logo.

- **Excel (.xlsx)**: Box Inventory, Product Summary (overall sample totals) and Original Records worksheets. The Box Inventory table has Date, Samples, Quantity and Remarks, with box/inventory-date headings above it. Consolidated remarks include original quantities and the number of source entries. Quantities and totals are numeric cells in matching columns. The flat Original Records sheet retains box/session columns for reimport; bookkeeping fields after the first six columns are hidden by default to keep the backup readable, and remain available for complete restoration.
- **Word (.docx)**: portrait pages, box/inventory-date headings with four-column tables, repeating table headers, subtotals, sample summary and original-record appendix. Box headings stay with the next table where practical.
- **PDF**: portrait pages and four-column tables, pagination, repeating headers, box totals, original-record appendix and grand total; space is reserved below box headings when practical. Large boxes may continue across pages.

Clear filters before exporting a complete backup. PNG, JPEG or AVIF logo uploads up to 2 MB are converted locally to PNG for consistent report embedding.

## Development and web hosting

Requires Node.js 22.12+ (validated with Node 24).

```sh
npm ci
npm run dev                 # Hosted development version
npm test                    # Calculation/import/report artifact tests
npm run build               # Static website in dist/
npm run build:standalone    # Regenerate the downloadable HTML
npm run test:e2e            # Browser workflows, downloads and standalone test
```

Browser tests use /usr/bin/chromium when present. Otherwise run `npx playwright install chromium` or set CHROMIUM_PATH. The suite starts its own Vite server on port 5180. Managed cloud Chromium blocks file: navigation, so the standalone test delivers the exact HTML bytes through a locally intercepted document request and rejects all external resource requests. It exercises persistence, CSV import, logo and all three exports without external resources. Direct file opening is intended for normal desktop browsers.

For web hosting, publish the contents of dist/ to a static host. Use `npm run build` as build command and dist as output directory. Relative paths support subdirectories. Pushing the source does not deploy a site. To distribute the offline app, distribute only standalone/Shemberg-Inventory.html.
