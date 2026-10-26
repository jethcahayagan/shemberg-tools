# Shemberg Inventory

A functional browser-based toothpaste and laboratory sample inventory workspace, built with HTML, CSS and JavaScript. Uses the official supplied Shemberg logo, with a replacement uploader (PNG, JPEG or AVIF).

## Run

Requires Node.js 22.12+ (validated with Node 24).

```sh
cd /workspace/shemberg-tools
npm ci
npm run dev
```

Open the address printed by Vite on your own machine. For a production build, run `npm run build`; serve the generated `dist/` directory through any static web host. `npm run preview` serves that build for local verification. No backend, database, API keys or accounts are needed. Use a web server rather than opening index.html as a file.

## Inventory and dates

- Add original records with inventory date, optional sample date, code, description, whole-unit quantity, box and remarks. Free-form codes such as `LB-2210` and box labels such as `1 (Brown)` are supported.
- The photographed sheet's **24 October 2026** is the inventory date; each row's historical date belongs in **Sample date**. Sample dates remain visible in source entries and original-record exports. Nothing from the handwritten photograph is automatically loaded as verified stock. The downloadable CSV template contains one illustrative row based on the photograph; review it before importing.
- Session timestamps capture when the count was entered; start a new session using the header button. Editing preserves the original session timestamp. Reports record a separate generation timestamp. Stored/exported timestamps use ISO UTC; the header displays your browser's local timezone.
- Boxes sort naturally (1, 2, 10), then dates oldest first, then natural alphanumeric product codes. Unassigned stock appears last under `UNASSIGNED BOX`. The screen offers alternate within-box sorts; reports always use the required default hierarchy.
- Numeric box labels `001` and `1` identify the same box; original labels remain in original records. Text box labels compare without case distinctions, with original labels preserved. Product codes are normalized to uppercase.
- Consolidation combines only **box + inventory date + product code**. Source records, descriptions, individual sample dates and every remark remain available by expanding the source-entry row. Different sample dates may appear under one consolidated row; different inventory dates never merge. Editing and deleting act on individual source records, then recalculate every total.
- Summary cards, box totals, product totals and grand totals use the current search/box/date filters. Clear filters before making a complete backup. The assigned-box count excludes the separately labeled unassigned group. Consolidated record count appears below Original records.

## Imports and exports

Use **Template** for instructions and a downloadable CSV template. Import CSV (including quoted commas and multiline remarks) or Excel **.xlsx**; save older .xls documents as .xlsx first. Required columns:

| Header              | Required | Format                                         |
| ------------------- | -------- | ---------------------------------------------- |
| Inventory Date      | Yes      | YYYY-MM-DD or Excel date cell                  |
| Sample Date         | No       | YYYY-MM-DD or Excel date cell                  |
| Product Code        | Yes      | Text, including laboratory sample names        |
| Product Description | Yes      | Text                                           |
| Quantity            | Yes      | Nonnegative whole units                        |
| Box Number          | No       | Text; blank stays unassigned                   |
| Remarks             | No       | Text                                           |
| Session Timestamp   | No       | ISO timestamp; omitted uses the active session |

Common aliases Date, Code/SKU, Description, Qty, Box/Box No and Notes also work. Format box-number cells as text to preserve leading zeros. For general Excel imports the first worksheet must contain the header row. Excel reports from this app automatically use the **Original Records** sheet when reimported, avoiding double counting consolidated totals. Invalid rows reject the entire import with the row number; no partial save occurs.

Imports show all rows for review before saving. Possible duplicates match date, sample date, code, description, quantity, box and remarks, both against saved records and within the file. They are skipped by default; uncheck the option to keep them deliberately. Different remarks are preserved as separate source entries. Duplicates with changed wording cannot be inferred automatically. Up to 15 MB and 50,000 records per import are supported; local storage capacity is typically much smaller, and failed saves leave current records intact.

The report preview and actual **.xlsx, .docx and .pdf** exports all use the same grouping and quantity calculations. Reports include box headings/totals, grand total, overall product summary, all original records (including sample dates and session timestamps), generation time and logo. Excel has separate Box Inventory, Product Summary and Original Records worksheets. Word repeats table headers and keeps box headings with the following table. PDF repeats headers, paginates, numbers pages and reserves space beneath each box heading when practical. Large boxes can continue across pages.

## Persistence and backups

Records and uploaded branding persist in this browser's localStorage, separately for each site address and browser profile. This is a single-browser tool, without shared multiuser storage or automatic cloud synchronization. Refreshing retains records; clearing site data removes them. Export an unfiltered Excel backup regularly, and before changing hosting addresses. Reimport its Original Records sheet to restore records. There is no sample data seeded into storage.

## Verification

```sh
npm test             # Core rules and actual Excel, Word and PDF artifacts
npm run build        # Production compilation
npm run test:e2e     # Browser workflow, downloads and responsive layout
```

Browser tests use `/usr/bin/chromium` when available. Otherwise run `npx playwright install chromium` first, or set `CHROMIUM_PATH` to an installed Chromium executable. The browser suite starts its own Vite server on port 5180. Tests cover add/edit/delete, refresh persistence, source inspection, filtering, duplicate review, Excel round-trip, branded downloads and mobile overflow. Core tests cover sorting, consolidation boundaries, validation, quantities, CSV parsing and report contents.

## Publish

Run `npm ci && npm run build` and upload **the contents of dist/** to a static host such as GitHub Pages, Cloudflare Pages, Netlify or an internal server. Use `npm run build` as the build command and `dist` as the output directory. Relative asset paths support repository subdirectories. For GitHub Pages, configure a Pages build workflow or publish dist through your preferred deployment tool. Pushing source code alone does not publish a website.

The supplied logo is included solely for this requested application; no other brand assets or stock images are used. The initial handwritten sheet is a reference, not a verified machine-readable inventory import.
