# Shemberg Sample Inventory

A working browser application for manually encoded toothpaste/sample inventories. The handwritten sheet is a **format reference only**: no photograph is transcribed, no unclear values are guessed, and no inventory is preloaded. The supplied official Shemberg logo is included, with an uploader for replacement branding.

## Download and use

Download **standalone/Shemberg-Inventory.html**, save it on your computer, and open it in a current Chrome, Edge or Firefox browser. This single file contains the app, styles, logo and Excel/Word/PDF libraries. No Node.js, server, installation or network connection is needed to use it.

Keep the HTML at the same file location and use the same browser profile. Browser storage is specific to the browser/site or local file location. Export unfiltered Excel backups regularly; moving the file, changing browsers or clearing browser data may show an empty inventory. The app is a local, single-browser workspace, without shared accounts or cloud synchronization.

## Sheet workflow

1. Set **Box Number** and **Date of Inventory (session)** in the sheet header. The box may be blank; that explicitly means unassigned.
2. Add each handwritten row using **Date (sample date)**, **Samples (name or code)**, **Quantity** and **Remarks**. The session date and box are supplied as editable defaults. Description is optional, since the original sheet has only a Samples column.
3. Names/codes retain entered capitalization and remarks retain their complete text. No mandatory TP-style code or separate description is imposed. Sample dates are not replaced with the stock-count date.
4. Choose **Consolidated view** or **Original records**. Both group by box, then sort by sample date oldest first and natural alphanumeric sample name/code. Expand any consolidated row to inspect all original quantities, remarks, sample dates, inventory dates and entry timestamps. Edit/delete always affects an individual original record.
5. Filter by inventory session, box, sample-date range or search. If several inventory dates are selected, totals combine those selected sessions; filter to one session for a single stocktake. The sheet-header settings control new entry/import defaults, not report filters.
6. Preview and export the selected records as actual Excel, Word and PDF files.

### Consolidation rules

Combine only the same **box + inventory session date + sample date + sample name/code**. Different sample dates stay separate even when the sample name/code repeats. Different inventory session dates and different boxes also stay separate. Every original source record, quantity and remark remains available. Different remarks are preserved together; descriptions remain in original records and overall sample summaries. Sample-code matching is case-insensitive while original capitalization is preserved.

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

Review every row and possible duplicate before confirming. No data is saved until confirmation. Duplicates are detected against current records and within the file by both dates, box, sample name/code, quantity, description and complete remarks. Possible duplicates are skipped by default; uncheck the option to retain them deliberately. Different remarks remain distinct original records, even when they later consolidate. Invalid rows reject the import with a row number; no partial save occurs. Limits: 15 MB and 50,000 rows per import; browser storage capacity can be much smaller. A failed save leaves existing records unchanged.

Excel reports from this app automatically reimport the **Original Records** worksheet, preventing double counting of consolidated totals. Older backups with undated original records can be restored without guessing dates; those originals remain separate.

## Reports

Screen and reports share the same calculation functions. Default order is box, sample date, sample name/code, then inventory date as a tiebreaker. Alternate screen sorting does not change the report order. All formats include box headings/totals, source counts, complete remarks, a grand total, overall sample summary, original records, distinct inventory dates/entry timestamps/generation timestamp and logo.

- **Excel (.xlsx)**: Box Inventory, Product Summary (overall sample totals) and Original Records worksheets. Dated rows contain Date, Samples, Quantity, Source Entries, Remarks and Date of Inventory; quantities and totals are numeric cells in matching columns.
- **Word (.docx)**: box headings with readable tables, repeating table headers, subtotals, sample summary and original-record appendix. Box headings stay with the next table where practical.
- **PDF**: landscape tables, pagination, repeating headers, box totals, original-record appendix and grand total; space is reserved below box headings when practical. Large boxes may continue across pages.

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
