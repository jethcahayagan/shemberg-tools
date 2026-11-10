# Shemberg QA Lab Chemicals Inventory

Created by **Jermaine Theus Cahayagan**. Copyright notice is included in the app and reports.

## Open the offline app

Download `standalone/Shemberg-Chemicals-Inventory.html`, keep it at a stable location, and open it in a current Chrome, Edge, or Firefox browser. Everything is embedded: the supplied logo, 136 locator entries, application, and Excel/Word/PDF export libraries. No server, Node installation, account, or Internet access is needed for use. The existing sample inventory is a separate application and retains its own storage.

The app opens to your **136 raw chemical stocks from the locator**, with names, formulas, CAS numbers, classifications and storage filled in. Quantities show **Not entered** until you supply a measurement. Click **Enter quantity** beside a stock, choose grams or milliliters, enter the measured amount and analyst, and save. A bottle ID is supplied automatically; container tare, density, lot and other details are optional settings. Different source rows/storage locations remain separate even when chemical names repeat. Existing bottle records and balances are preserved. Use Add bottle for additional lots/containers or chemicals not in the locator.

Unmeasured locator stocks are included in inventory reports with blank quantities and “Quantity not entered.” They are not reported as zero or withdrawn from. JSON backups retain your measured records; the default locator stays embedded in the app.


## Update without losing records

In your current HTML, choose **Backups & guide → Download backup** first. Close the old app, replace the HTML using the **same file name and location**, and open it in the **same browser profile**. The storage key and backup schema remain unchanged. Existing quantities, immutable bottle keys and historical events are retained. Explicit numbering repair can correct display labels while retaining prior labels as aliases. New optional tracing fields are filled in memory; opening the new version does not rewrite stored records. If a different location/profile shows an empty inventory, restore your JSON backup; do not re-enter your records. A snapshot of your real browser data cannot be verified from the repository; the upgrade has been tested with legacy-format records and logs.

**All chemicals / Active / Old stock** divides raw stocks without renaming bottle IDs. Existing `OLD STOCK RAW-…` names/IDs and the locator's Old stock group are recognized unless a stock group is explicitly set. Use **Details → Correct details** to change the group. Every original ID and past log entry remains unchanged.

**Internal chemical code** is separate from bottle ID. Locator entries receive a stable `CHEM-<source row>` code; other bottles receive a stable code based on their record key. Codes can be edited. **Lab code**, **formula weight (g/mol)**, **date opened**, and **opened by** are available when adding a bottle or correcting details. The short Enter quantity form has them under Container, lot and stock settings. Formula weight is a manually verified label/SDS value, not calculated from the unverified locator formulas. Record both opening date and person together.

Selecting **Solid** uses grams and hides density/temperature fields; mass/volume conversion is disabled for solids. Previously saved density metadata is preserved, but is not used or displayed as a solid stock requirement. Liquid density includes an optional temperature in °C; older records show the temperature as unrecorded until supplied. All tracing fields and before/after weight details are included in reports and JSON backups.

## Registration numbering update and November inventory reconciliation

The download ZIP includes **Shemberg-Backup-Updater.html**. Open it, choose your existing JSON backup, review the proposed corrections and download the updated JSON. The tool runs entirely on your computer; actual bottle records and logs are not embedded in the public app download. Then restore the updated JSON in the inventory app. Your original JSON file is not overwritten. Alternatively restore your backup first, then use **Chemical registry → Fix numbering / update list** to preview and apply the same corrections in the running app.

For the supplied November 10 main backup, validation retained all **52 bottle records, 91 original activity events and 9 original registry-history entries**. All original record keys, balances, gross/tare measurements, lots, suppliers, dates and bottle formulas remain. Twelve existing labels/codes needed visible corrections; every bottle also gains a stable container code. Old labels/codes remain searchable aliases and existing historical events retain their original text. New audit entries explain registration changes.

The code format is **OLD STOCK CHEM-066** for Old stock and **CHEM-066** for Active. Stock-group prefixes do not create separate numeric sequences. Set Active / Set Old stock changes the registry default and its non-archived bottles without changing the numeric chemical reference or quantities. Registration-generated IDs/codes are read-only; shared details remain editable. The registry code is authoritative when a manually typed bottle code conflicts. A wrong registry link is repaired only when there is one unique matching name AND CAS; conflicting scientific metadata is retained for review.

Bottles of one registry chemical use **1/3 RAW-041, 2/3 RAW-041, 3/3 RAW-041** (a single bottle displays RAW-041). Fractions count non-removed, non-disposed bottles across Active and Old stock for that chemical. They update when another bottle is added, removed, restored or disposed. The stable **RAW-041-B001** container reference and immutable record key remain unchanged even when fraction totals change. Never use only the fraction as the permanent container reference. Previous labels are visible in Details and searchable, and stable container codes can be selected in reports.

**Add bottle** on a bottle row copies that selected bottle's shared/lot details. Register bottle from the registry uses the latest non-archived bottle of the chemical. Supplier, lot, storage, lab code, grade, density, receipt/expiry and other reference fields are prefilled and editable. Quantity, empty-container tare, Date opened and Opened by stay blank for the new container. Review every copied lot/date before saving. Automatic code and bottle-number previews follow the selected registry entry rather than spreadsheet row numbers or arbitrary suffixes.

The attached November workbook was compared to the main JSON and source catalog. **34 missing/distinct-grade definitions** are included as add-only metadata, defaulting to Active and with **no quantities or invented bottles**. Eleven same-name/CAS conflicts were held for label/SDS review rather than overwriting the main registry. Different brands/grades sharing a CAS were not silently merged. The workbook's historical quantity estimates are not used to overwrite live JSON balances. A bottle formula differing from its uniquely matched registry is flagged; the original formula remains.

## Chemical registry and list edits

Open **Chemical registry → Add chemical** to define a chemical without entering a quantity. Name and recorded-by/reason are required; formula, CAS, classification, default storage, hazards and formula weight can be supplied. The entry appears immediately in Raw chemicals with quantity Not entered. Use Enter quantity or Register bottle to add containers.

Use **Edit chemical** on an existing registry row. Shared name, formula, CAS, classification, hazards and formula weight update linked non-archived bottles. Quantities, physical bottle IDs/keys, lots, dates and bottle storage locations stay unchanged. Default storage and stock group apply to future containers. Registry additions/edits retain before/after metadata, analyst and reason; linked bottles also receive an audit entry. Original locator data stays embedded separately.

Custom raw chemicals saved before the registry existed are included without renaming records or guessing that similar names are the same chemical. Repeated entries/containers are not silently merged. Archived bottle identity remains as it was when disposed.

## Disposal review and archive

Use **Disposal → Suggest for disposal** on either a raw or standardized bottle, recording the analyst and reason. The suggestion does not change stock or archive the bottle. Filter inventory by Suggested for disposal to review candidates. Use Clear disposal suggestion if appropriate; that decision is also logged.

For unmeasured locator/registry stock, **Suggest disposal** creates a container record with unknown quantity. Supply a unique container ID; no quantity is invented.

After an entire container has actually been disposed, choose **Confirm disposal and archive**, record the reason, person and optional receipt/reference, and check the explicit confirmation. Known available balance becomes zero; an unknown balance stays unknown. The pre-disposal net balance and last gross reading remain in the archive and audit history. Disposed stock leaves working inventory, cannot be withdrawn/edited, and does not reappear as an unmeasured default. Other containers of the same chemical are unaffected. The chemical definition remains in the registry so later containers can be added. Use **Disposal archive → Details** to review it; the full logbook and JSON backup retain all events. There is no permanent deletion or physical disposal action performed by the app.

## Import registry lists and continue live numbering

Use **Chemical registry → Import list**. Download the header-only CSV template, or supply a .xlsx file with headers in the first row of its first worksheet. Required: Chemical name. Optional: Molecular formula, CAS number, Classification, Storage, Key hazards, Formula weight, Stock group, Lab code and Purity. Maximum 10 MB and 5,000 rows. Import adds registry entries, not measured quantities or bottle balances.

Numbering is calculated from the state loaded in the actual running browser: current definitions, bottle records, original locator codes and historical codes, including archived/removed records. It does not rely on the data in this development checkout. **Load or restore your latest real JSON backup before importing if the new HTML opens without your current records.** The prefix and number width are shown and editable; the next code and every proposed code appear in preview. Existing codes and IDs are never renumbered. New manual registry entries also receive a suggested next code.

Preview validates the entire file before any changes are saved. Exact matches on name, CAS, formula, storage and purity (case/space normalized) are marked as duplicates and skipped. Repeated headers and recognizable standalone stock headings are ignored. Review similar-looking names yourself; different grades or storage can be separate entries. Codes supplied in the file are ignored in favor of the current automatic sequence. Uncheck unwanted rows, then enter the analyst/import reference and confirm. Unchecked rows can leave number gaps; the selected codes shown in preview are retained. Cancel, invalid files and failed writes preserve the existing registry and quantities. Use Edit chemical for corrections to existing definitions; imports do not overwrite them.

## Readable, selectable reports

Open **Export / Create report**. Choose a category, then select the report sections: Bottle inventory (default), Consolidated chemical overview, and/or Withdrawal/activity log. Choose inventory columns in the collapsed column list. The default is a compact eight-column inventory: Code, Chemical/solution, Bottle ID, Quantity, Storage, Lot/batch, Expiration and Status. Use Choose chemicals and bottles to select individual rows, Select all shown or Clear shown. Current view, search, storage, status and Active/Old stock filters continue to apply. The count updates before export.

Excel, PDF and Word now contain reading/report tables only: no JSON snapshots, hidden tracing fields, source-locator appendix, registry-history dump or automatic extra logbook. The log is included only when selected and contains understandable action/quantity/person/purpose columns. Excel repeats headings for printing, freezes table headers, wraps text and fits pages horizontally. PDF/Word use landscape tables. PDF embeds Liberation Sans regular/bold fonts for consistent rendering on other computers; the font license is included in the source and PDF metadata. CSV uses the selected table headings; if multiple sections are selected, it contains separate tables separated by blank lines. Reports identify their selected category and generation time. Keep a JSON backup for complete restoration and full audit/registry history.

Groups follow the existing classification text mapping: indicator, then acid, base, oxidizer, salt, solvent; otherwise Other / unclassified. A chemical has one export category under this mapping; it is not a storage-compatibility determination. Export from Disposal archive for disposed containers and Removed records for removed inputs. Normal inventory reports exclude both. Logbook Export all records can include disposal archives but excludes removed inputs unless you explicitly export from Removed records.

## Chemical overview and mistaken bottle records

Use **Chemical overview** above the inventory to consolidate recorded bottles of the same chemical. Name, CAS, formula, concentration and purity must match after simple case/space normalization; different concentrations/grades/formulas are kept separate. Codes, storage locations and bottle IDs remain available under View bottles. Totals for net grams and net milliliters remain separate; gross bottle weights are never added as net chemical stock. Unknown quantities remain counted separately. Rows with no recorded bottles do not establish a physical bottle count. Review flags and disposal suggestions remain visible; a positive recorded balance does not certify suitability.

Use **Delete record** for a redundant or mistaken bottle input, provide the reason/person and confirm. It is removed from working stock, overview totals and ordinary reports, but its quantity, ID and original log entries remain intact. **Removed records → Restore** reverses the removal and logs the reason. Bottle IDs and chemical numbers remain reserved. Removal is record correction, not physical chemical disposal; disposal stays separate. JSON backups retain removed records and their history.

## Shelf-life review

Your selected default is **24 months** when no manufacturer expiration date is recorded. The age estimate starts at Manufacture date when supplied, otherwise Date received. Missing both dates is shown as needing a date; the app does not invent a manufacture date. Set Unopened/age review months per bottle (0 disables it). An optional Review after opening period starts at Date opened. Month calculations respect calendar month ends.

Manufacturer expiration takes priority over the unopened age estimate; an explicitly configured after-opening review can still be earlier. **Shelf-life review due** is a request to evaluate the reagent against its label, SDS, certificate and lab procedure. It does not automatically change Expiration, mark the reagent expired, dispose it or block withdrawal. Opened-container periods are not inferred from a universal average. The 2–5 year general range is not a reliable expiry rule for every reagent.

## Raw chemicals

Record chemical identity, purity/grade, physical state, lot/batch, supplier, storage, date received, expiry, optional minimum stock, and analyst. Choose a fixed stock unit: net grams or milliliters. Other source reagents can be registered here; the workbook does not establish purity or physical state.

- **Net mass:** directly measured grams.
- **Measured volume:** directly measured mL. One cm³ equals one mL.
- **Gross bottle weight:** grams including the container. A known empty-container tare gives net mass = gross − tare. Use the same cap/container configuration. Without tare, net stock stays unknown. You can still withdraw using before/after gross bottle weights; the latest gross reading guides inventory without pretending it is net stock.
- **Density:** optional verified g/mL with its temperature in °C, required whenever converting g to mL or mL to g. No 1 g/mL assumption is made. Use the appropriate chemical/concentration/temperature value from a verified source.

Withdrawals require quantity, analyst and purpose/test/use. Known-quantity withdrawals reduce net balance automatically and cannot exceed it. With **Before / after bottle weights**, enter the two weights in grams and confirm the same bottle/cap/container configuration. The difference is grams removed; the latest gross weight is saved. Unknown net balance stays unknown. If net balance is known, the difference also reduces it, using verified density for liquid volume conversion. A discrepancy from the previously recorded gross weight remains in event details; use Physical inventory to reconcile net stock. Date/time, before/after balances, entered quantity/unit, and converted withdrawal are retained. Use Physical inventory to record a new measured balance, explain discrepancies or a same-lot replenishment. Register a separate bottle for another lot. Correct details changes metadata with a recorded reason; it does not change stock or its fixed unit. Mistaken bottles can be reversibly removed; their original logs and balances are retained.

## Standardized stocks

Use a unique bottle ID, solution name, verified concentration **with units**, standardization date, next restandardization due date, and analyst. These bottles support the same inventory, withdrawal, traceability and stock alert workflows. Restandardize records the new concentration, date, analyst and next due date, retaining previous standardization metadata in history. Preparing a standard does not automatically withdraw its raw ingredients; log each actual raw-bottle withdrawal separately with the preparation reference.

## Levels and alerts

An optional full-reference amount in the stock unit produces an approximate percentage/fill category. A manually observed Full / Three-quarter / Half / Quarter / Empty level and liquid height in cm or inches from the inside base can be recorded separately, including after withdrawal. Neither observation adjusts measured stock. Bottle shape makes height-to-volume conversion unreliable without a calibrated vessel; no such conversion is assumed.

Minimum alerts are per bottle at or below the configured threshold. Expiration and restandardization alerts include a 30-day upcoming window; restandardization due today is flagged. Blank dates/thresholds mean not recorded. No notification occurs while the app is closed. Due-date flags do not certify chemical/solution suitability.

Search by name, bottle, CAS, lot, supplier or concentration. Filter by storage, chemical category, or alert; sort by storage, classification, dates, name, bottle ID, or balance grouped by unit. Category filters are derived from source classification text, not verified compatibility/hazard classes. The app never totals grams and milliliters together.

## Exports, persistence and recovery

Reports export only the rows, columns and report sections you choose, with separate units and understandable quantities. PDF uses baseline digits for subscripts for font compatibility. JSON backups retain the complete workspace and history independently of report selections.

Use **Backups & guide → Download backup** after each lab session. JSON preserves both inventories and all audit history, and is the only supported restoration format. Restore validates the file and explicitly confirms replacement of the entire chemicals workspace. Export a current backup first. CSV/Excel registry import is add-only metadata import, not inventory/balance restoration or a backup merge. Source files and reports cannot substitute for the JSON backup.

Data lives in browser localStorage. Keep the same browser profile and file location. Moving the HTML file or clearing browser data can show an empty workspace. There are no shared accounts, cloud synchronization, access controls, electronic signatures, or tamper-proof records. Failed storage writes leave the in-memory and saved balances unchanged. Corrupt stored data is preserved for recovery rather than silently reset.

## Source provenance

`src/chemicals/catalog.json` preserves the six source columns from the uploaded `Chem Locator (for QAS-20-008).xlsx`, Chemical Locator worksheet. Empty/decorative rows and repeated headings are excluded; all 136 chemical entries retain workbook row numbers and source stock grouping. Some source names, formulas, CAS values, and classifications appear inconsistent. They were not silently corrected. Verify actual identities and hazard/storage requirements against bottle labels and SDS; storage locations are locators, not storage-compatibility recommendations. The supplied AVIF logo is embedded and converted locally to PNG for reports.

## Suggestions from previous entries

Start typing in Supplier, Storage, Recorded by/Analyst, Opened by, Lab code, Classification, Purity/grade, Lot number, Concentration, Chemical name, Formula, CAS, Hazards or Notes to choose a previously saved value. You can always type a new value. Names entered as analysts and people who opened bottles are available in both person fields.

Purpose/reason suggestions are kept relevant to the form: withdrawal purposes come from previous withdrawals, disposal reasons from disposal records, and registry references from registry edits. Suggestions include saved archives and historical details, so an earlier supplier or location can still be reused. Empty values and duplicate spelling variants are omitted from suggestions without changing the original records.

The dropdown uses the browser’s built-in suggestions; appearance and filtering vary by browser. It works in the offline HTML and requires no new storage or schema changes. Opening a form does not automatically fill a value or save anything. Numeric measurements, dates, and unique bottle/internal IDs do not receive suggestions. Only saved records are reused; cancelling a form does not add its text to suggestions.

## Development

From `/workspace/shemberg-tools`, using Node.js 22.12+ (Node 24 validated):

```sh
npm ci
npm run dev                    # /chemicals.html for hosted development
npm test                       # Existing tests plus chemical accounting tests
npm run test:e2e                # Existing workflows plus chemicals/offline tests
npm run build                  # Both hosted applications in dist/
npm run build:chemicals         # Main offline app and local backup updater
npm run package:chemicals       # Rebuild + verify downloadable ZIP (Python 3)
```

Browser tests use `/usr/bin/chromium` when available or `CHROMIUM_PATH`. They start Vite on port 5180. Managed cloud Chromium restricts direct file navigation; the offline tests deliver the exact generated HTML through one intercepted document response and reject other resource requests. They verify registration, mass/volume withdrawals, reload persistence, and all three rich report downloads without external resources. The standalone app itself is intended for direct opening in normal desktop browsers. Rebuild the chemical standalone after changing its source; `build:standalone` remains the existing sample app's build command.

The download ZIP is built from an explicit four-file allowlist (app HTML, updater HTML, start instructions and identity-review CSV). User JSON backups are never included by the packaging script.
