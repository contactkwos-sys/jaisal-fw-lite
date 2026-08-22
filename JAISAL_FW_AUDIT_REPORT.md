# JAISAL FW / Fashionweave Industries — Full Software Audit Report

**Date:** 21 August 2026  
**Status:** READ-ONLY AUDIT — no code, routes, UI, database, or sidebar was changed.  
**Purpose:** For review by software consultant / ChatGPT before any compaction or merge decisions.

---

## How to use this report

1. Review the inventory and duplicate tables.
2. Decide KEEP / MERGE / REMOVE for each candidate.
3. Only after that decision, instruct the developer/agent to implement changes.
4. Do **not** treat this report as permission to change the system.

---

## Important terminology note (current vs desired)

| Current in software | Desired / correct |
|---------------------|-------------------|
| DIN / DIN Intake / DIN Costing | **DESI** / DESI Intake / **Design-wise Costing** |
| Matching-wise (used on Weft Issue / yarn requirement) | Keep as yarn requirement wording if needed — **Do NOT use “Matching-wise Costing”** |
| Actual DB field `din_number` / tables `dins`, `din_*` | May remain technically until a later rename migration; UI terminology should become DESI |

**Finding:** The string **DESI** does not currently appear as a product term. The UI still says **DIN** almost everywhere.

---

## App architecture (short)

- SPA (Vite + React + Supabase)
- Navigation is **not URL routes** — it uses internal screen IDs in `src/lib/nav.ts` → sidebar → `App.tsx`
- Live app: https://jaisal-fw-lite.netlify.app
- Repo has grown in phases; newer modules (DTO, Program & Dispatch, Warp Yarn, Security Inventory, Machine-wise Production, HR Payroll) sit beside older Phase 1–8 screens

---

# TASK 1 — COMPLETE MODULE / PAGE INVENTORY

## Main modules (sidebar): 14

| # | Module name | Opens as |
|---|-------------|----------|
| 1 | Dashboard | Direct screen |
| 2 | Production | Module hub |
| 3 | Inventory | Module hub |
| 4 | Design to Order | DTO hub |
| 5 | Program & Dispatch | Direct (PTO) |
| 6 | Warp Yarn Management | Direct (overview) |
| 7 | HR & Payroll | Module hub |
| 8 | Machine-wise Maintenance | Module hub |
| 9 | Security / Inward | Module hub |
| 10 | Orders & Pending | Module hub |
| 11 | Cash Book | Direct |
| 12 | Reports | Module hub |
| 13 | Masters | Module hub |
| 14 | Settings | Module hub |

---

## Full page inventory

For each page: Module | Page | Route (screen/sub) | Purpose | Features | Database | Linked to | Duplicate?

### 1. Dashboard

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Dashboard | CEO Dashboard | `home` | Factory KPIs & quick access | KPIs, alerts, shortcuts | Many read-only tables | Most modules | No |

### 2. Production

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Production | Warp Issue | `warp-yarn` / `machines` | Issue/return beams on loom | M1–M6 beam status | `warp_pipes`, transactions | Warp Yarn module | Same as Warp Yarn → Machine Beam |
| Production | Machine-wise Production | `machine-wise-production` / `weft` | Weft issue + production home | Matching groups, KG from costing | `machine_weft_issues*`, `design_costing*`, `programs` | Reports | Same screen as Weft Yarn Issue |
| Production | Weft Yarn Issue | `machine-wise-production` / `weft` | Matching-wise weft issue | Same as above | Same | Same | **Exact duplicate menu → same page** |
| Production | Production Entry (MWP) | `machine-wise-production` / `entry` | Shift/operator meters | Program-linked entry | `production_entries`, `programs` | PD Entry | **Triple with PD + legacy** |
| Production | Folding | `program-dispatch` / `folding` | Folding & checking | Lots, damage | `checking_lots`, `lot_damages` | Program & Dispatch | Deep link into PD |
| Production | Dispatch | `program-dispatch` / `challan` | Challan / dispatch | Create challan | `challans` | Program & Dispatch | Deep link into PD |
| Production | Machine-wise Report | `machine-wise-production` / `report` | Production & weft reports | Print/CSV | issues + entries | Reports | Deep link |
| Production | Shift-wise Production | `production` / `report` | Classic shift report | Daily report | `production_entries` | Inventory “Greige Stock” also opens this | Overlaps PD/MWP reports |

### 3. Inventory

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Inventory | Yarn Stock | `stock` / `weft` | Weft yarn stock master | Opening stock, ledger | `weft_yarn_stock`, `yarn_stock_ledger` | Purchase weft | Partial (stock updates from multiple places) |
| Inventory | Warp Yarn Management | `warp-yarn` / `overview` | Open WYM module | Deep link | warp_* | Warp Yarn | Same module home |
| Inventory | Yarn Inward OCR | `yarn-inward` | Invoice OCR yarn inward | Scan + list | `yarn_inward` | Security OCR | **Exact duplicate menu** |
| Inventory | Greige Stock | `production` / `report` | Label says greige | Opens production report | `production_entries` | — | **Misleading link** |
| Inventory | Consumables | `purchase` / `maint_in` | Maintenance inward | Purchase UI | `maintenance_inward*` | SI maint-in | **Duplicate entry path** |
| Inventory | Inward | `purchase` / `general` | General purchase inward | Multi-item | `general_purchases*` | SI general | **Duplicate entry path** |
| Inventory | Stock Adjustment | `admin` / `approvals` | Label: adjust stock | Opens approvals | approval queues | Security Approvals | **Misleading link** |
| Inventory | Stock Reports | `purchase` / `report` | Purchase/stock reports | Reports | purchase tables | Reports | Deep link OK |

### 4. Design to Order

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Design to Order | Design to Order Hub | `dto-hub` | Pipeline hub | DIN list, KPIs, quick nav | `dins`, matchings, costing | All DTO pages | No |
| Design to Order | DIN Intake | `dto-intake` | Receive design / create DIN | Upload, photo, Gmail stub, matchings | `dins`, `din_matchings` | Hub | No |
| Design to Order | DIN Costing | `design-wise-costing` | Design-wise costing engine | Warp/weft diary, final ₹/mtr | `design_costing*` | Reports, Design Screen | Same engine, multi entry points |
| Design to Order | Sample Job Card (DTO) | `dto-sample-job` | Issue sample from DIN | Matchings, print | `din_sample_cards` (+ may mirror `sample_job_cards`) | Standalone Sample Job Card | **Duplicate issuer** |
| Design to Order | Sample Tracking | `dto-tracking` | Produce / receive / approve | Matching status | `dins`, `din_matchings` | Sample Register | Partial overlap |
| Design to Order | Order Booking | `dto-order-booking` | Book from approved matching | Writes order book | `order_book*` | Order Book screen | **Duplicate order UI** |
| Design to Order | Order Status | `dto-order-status` | Pending & status | vs programs | `order_book_items`, `programs` | Programs | No (status view) |
| Design to Order | Customer Promotion | `dto-promotion` | Share approved sample | WhatsApp | parties / CRM | Broadcast / Catalog | Similar promo intent |
| Design to Order | Order Follow-up | `dto-followup` | Party follow-ups | Reminders | `din_followups` | — | No |
| Design to Order | DTO Reports | `dto-reports` | Pipeline reports | Stats | dins / orders | — | No |

### 5. Program & Dispatch

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Program & Dispatch | Program to Production | `program-dispatch` / `pto` | Order → machine program | Select order, create program | `order_book_items`, `programs` | Legacy Program Card | **Duplicate with legacy** |
| Program & Dispatch | Production Entry (PD) | `…` / `entry` | Shift meters | Entry form | `production_entries` | MWP Entry | **Triple** |
| Program & Dispatch | Production Tracking | `/tracking` | Live meters | Order → dispatched | programs + entries | — | No |
| Program & Dispatch | Folding & Checking | `/folding` | Lots / damage / final meter | Checking lots | `checking_lots*` | Orphan DispatchScreen | **Duplicate** |
| Program & Dispatch | Dispatch / Challan | `/challan` | Create challan | Select lots | `challans` | Orphan DispatchScreen | **Duplicate** |
| Program & Dispatch | Gate Pass | `/gatepass` | Vehicle gate pass | Print GP | `gatepass` | Maint uses different `gate_pass` | Different doc type |
| Program & Dispatch | Invoice | `/invoice` | GST invoice | Print/PDF | `gst_invoices` | — | No |
| Program & Dispatch | Dispatch Reports | `/reports` | PD reports | Production/checking/dispatch | mixed | Reports hub | Deep link OK |
| Program & Dispatch | Program Card (Legacy) | `programs` / `create` | Classic program card | Old UI | `programs` | PD PTO | **Legacy duplicate** |
| Program & Dispatch | Job Card Issue (Legacy) | `production` / `job` | Classic job cards | Old UI | `job_cards*` | PD flow | **Legacy duplicate** |

### 6. Warp Yarn Management

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Warp Yarn | Overview | `warp-yarn` / `overview` | Live KPIs | Beam/pipe KPIs | `warp_pipes*` | Inventory link | No |
| Warp Yarn | Machine Beam Stock | `/machines` | On-loom beams | M1–M6 | same | Production Warp Issue | Same page dual menu |
| Warp Yarn | Warehouse Filled Beams | `/godown` | Godown filled | Stock | same | — | No |
| Warp Yarn | Empty Pipe Stock | `/empty` | Empty pipes | Inventory | same | Legacy beam stock | Layered eras |
| Warp Yarn | Warper / Job Worker | `/warper` | Issue / return warper | KG/meter | `warp_warper_jobs`, purchases | — | No |
| Warp Yarn | Warp Reports | `/reports` | History | Transactions | txns | — | No |
| Warp Yarn | Beam Remaining | `beam-remaining` | Meters left | Report + loading | `v_beam_remaining_report`, `beam_loading` | Reports | Dual menu, same page |
| Warp Yarn | Beam Pipe (Legacy) | `warp-beam-pipe` | Jobber OUT/IN | Legacy tracker | `warp_beam_pipe` | Dual-written from WYM | **Legacy duplicate** |

### 7. HR & Payroll

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| HR & Payroll | Dashboard | `hr-payroll` / `dashboard` | Live KPIs | Attendance/payroll KPIs | workers / attendance / payroll | — | No |
| HR & Payroll | Employee Master | `/employees` | Employees | Bank, designation | `workers` | Masters | Dual menu OK |
| HR & Payroll | Attendance | `attendance` | Daily attendance | Date & shift | `attendance`, `workers` | — | No |
| HR & Payroll | Leave / Holiday | `/leave` | Leave + holidays | Entries | `leave_entries`, `holidays` | — | No |
| HR & Payroll | Salary Rate Master | `/rates` | Rates | Monthly/daily/hourly | `salary_rates`, `payroll_rates` | Admin legacy payroll | Partial |
| HR & Payroll | Payroll | `/payroll` | Calculate & approve | Run payroll | `payroll_runs`, `payroll_entries` | — | Canonical |
| HR & Payroll | ESI / PF / PT | `/statutory` | Statutory toggles | Deductions | payroll flags | — | No |
| HR & Payroll | Salary Register | `/register` | Monthly history | Register | entries | — | No |
| HR & Payroll | Salary Payment | `/payment` | Bank transfer ready | Selection | entries | — | No |
| HR & Payroll | Bank Salary Letter | `/bank-letter` | Printable bank statement | Letter | `bank_salary_letters*` | — | No |
| HR & Payroll | Reports | `/reports` | Attendance & payroll reports | Reports | mixed | Reports hub | Dual menu OK |

### 8. Machine-wise Maintenance

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Maintenance | Machine Overview | `maintenance` / `overview` | M1–M6 status board | Status | breakdowns etc. | Masters Machine Master | Dual menu |
| Maintenance | Breakdown Entry | `/breakdown` | OPEN → CALL → ARRIVED → RESOLVED | Workflow | `machine_breakdowns*` | — | No |
| Maintenance | Complaint Register | `/complaints` | Machine complaints | Register | `maint_complaints` | — | No |
| Maintenance | Maintenance Entry | `/entry` | Planned / general | Entry | `maintenance_requests` | — | No |
| Maintenance | Maintenance Schedule | `/schedule` | Calendar & due dates | Schedule | `maint_schedules` | — | No |
| Maintenance | Service History | `/history` | History from entries | History | derived | — | No |
| Maintenance | Spare Parts | `/spares` | Stock & low-stock | Spares | `maint_spare_parts` | — | No |
| Maintenance | Contacts Directory | `/contacts` | Technicians & contractors | Directory | `maint_contacts` | — | No |
| Maintenance | Maintenance Reports | `/reports` | A4 / CSV | Reports | mixed | — | No |
| Maintenance | Material Out / In | `maint-material` | Material + auto gate pass | Out/In | `maintenance_material`, `gate_pass` | SI repair | **Overlap** |
| Maintenance | Repair Out / In (Legacy) | `maintenance` / `repair` | Legacy repair tracker | Old UI | `repairing_tracker` | SI maint-out | **Legacy duplicate** |

### 9. Security / Inward

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Security | Security Inventory | `security-inventory` / `dashboard` | Gate dashboard | Overview | `security_inventory_*` | — | No |
| Security | Warp Yarn Inward/Outward | `/warp` | Warp at gate | Syncs to WYM | SI + warp purchases/pipes | WYM / Yarn OCR | Multi entry |
| Security | Weft Yarn Inward | `/weft` | Colour weft + GST + photo | Inward | SI + `weft_purchases*` | Purchase weft / OCR | Multi entry |
| Security | Maintenance Material Inward | `/maint-in` | Parts / store inward | Inward | SI + `maintenance_inward*` | Purchase maint_in | **Duplicate** |
| Security | Repair Out / In | `/maint-out` | Repair outward + return | Out/In | SI + material/GP | Maint Material / Legacy | **Triple** |
| Security | General Item Inward | `/general` | Item master dropdown | Inward | `inventory_item_*`, purchases | Purchase general | **Duplicate** |
| Security | Other Inward | `/others` | Uncommon material | Entry | SI entries | — | No |
| Security | Pending Entries | `/pending` | Pending outward/repair/docs | Queue | SI | — | No |
| Security | Security Reports | `/reports` | Daily & A4 reports | Reports | SI | — | No |
| Security | Security Gate Logs | `security` / `inward` | Consolidated gate logs | Aggregates | purchases, challans, gatepass | — | Read aggregate |
| Security | Yarn Inward OCR | `yarn-inward` | Invoice scan | Same OCR page | `yarn_inward` | Inventory OCR | **Exact duplicate menu** |
| Security | User / PIN Management | `admin` / `roles` | Users & roles | PIN | `users`, `roles` | — | Belongs more to Settings |
| Security | Permission Management | `admin` / `permissions` | Module access by role | Permissions | localStorage + UI | — | Settings candidate |
| Security | Approvals | `admin` / `approvals` | CEO approval queue | Queue | `approval_queue` / pending | Inventory Stock Adj | Dual menu |
| Security | GEB Reading | `geb-readings` | Electricity meter entry | Units & cost | `geb_readings` | Reports; Costing uses other table | Dual electricity systems |

### 10. Orders & Pending

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Orders & Pending | Orders & Pending | `orders-pending` | Raise/track factory pending | Create/pending/all | **`orders`** (NOT `order_book`) | — | **Name clash** with sales orders |
| Orders & Pending | Order Book | `orders` / `entry` | Party fabric orders | Entry + party report | `order_book*` | DTO Order Booking | **Duplicate UI** |
| Orders & Pending | Design & Job Card | `design` | Design register | Register + open costing | `designs` | Masters Design Master | Same page dual menu |
| Orders & Pending | Design Catalog | `design-catalog` | Design DNA catalog | Photos + share | `design_catalog` | Masters Item Master | Same page; Item Master misnamed |
| Orders & Pending | Design Broadcast | `broadcast` | Post & share designs | WhatsApp share | `design_broadcasts` | DTO Promotion | Similar intent |
| Orders & Pending | Sample Register | `sample-register` | Sample log | Pending/done | `sample_job_cards*` | DTO Sample Tracking | Partial overlap |

### 11. Cash Book

| Module | Page | Route | Purpose | Features | Database | Linked | Duplicate? |
|--------|------|-------|---------|----------|----------|--------|------------|
| Cash Book | Cash Book | `cash-book` | Cash in/out + ledgers | Entry, party ledger | `cashbook_*` | — | No |

### 12. Reports (mostly deep links)

| Label | Opens | Notes |
|-------|-------|-------|
| DIN Costing | `design-wise-costing` | Same engine as DTO |
| Production Report | PD `/reports` | Deep link |
| Machine-wise Production | MWP `/report` | Deep link |
| Stock Report | Purchase report | Deep link |
| Party Delivery Report | Order Book `/report` | Deep link |
| Beam Remaining | `beam-remaining` | Also under Warp Yarn |
| Costing Report | `costing` / `summary` | **Daily P&L**, not Design-wise Costing |
| GEB Electricity | `geb-readings` | Dual with `electricity_entries` |
| Loan Tracker | `loan-tracker` | `loan_entries` |
| Attendance Report | HR reports | Deep link |

### 13. Masters

| Page | Route | Notes |
|------|-------|-------|
| Party Master | `parties` | `party_master` |
| Item Master | `design-catalog` | **Wrong semantic** — opens Design Catalog |
| Machine Master | `maintenance` / `overview` | Deep link only |
| Employee Master | HR employees | Deep link |
| Design Master | `design` | Same as Design & Job Card |
| Department Master | `placeholder` | **Not built** |
| Shift Master | `placeholder` | **Not built** |
| CRM Customers | `crm` | Separate from `party_master` |

### 14. Settings

| Page | Route | Notes |
|------|-------|-------|
| Company Settings | `placeholder` | **Not built** |
| Shift Settings | `placeholder` | **Not built** |
| Notification Settings | `placeholder` | **Not built** |
| Backup | `placeholder` | **Not built** |
| System Preferences | `costing` / `electricity` | **Wrong target** — opens electricity entry |

### Screens that exist in code but are weak/missing in sidebar

| Screen | How reachable |
|--------|----------------|
| `dispatch` (**DispatchScreen** — classic folding/challan/gatepass) | **Unreachable from sidebar** (only mounted in App.tsx) |
| `sample-job-card` (standalone Sample Job Card) | Only button from DTO Sample Job Card |
| `security-inventory` / `documents` | Handled in App; **no sidebar item** |
| `settings-hub` | Declared type only — **never rendered** |
| Stock beam tab (`stock` / `beam`) | Via Yarn Stock then tab; titled “Warp Beam Stock (Legacy)” |

---

# TASK 2 & 3 — DUPLICATE FUNCTIONS (CLEAR TABLE)

| Function | Page/Module 1 | Page/Module 2 | Page/Module 3 | Duplicate? | Recommendation (DO NOT change yet) |
|----------|---------------|---------------|---------------|------------|-------------------------------------|
| Production Entry | Production → Machine-wise → Entry | Program & Dispatch → Production Entry | Production → Machine Entry (legacy) | **YES — 3 UIs**, all write `production_entries` | Consolidate to ONE entry UI later |
| Folding / Checking | Program & Dispatch → Folding | DispatchScreen folding (unreachable) | — | **YES** | Keep PD; remove orphan later |
| Dispatch Challan | PD → Challan | DispatchScreen challan | — | **YES** | Same |
| Dispatch Gate Pass | PD → Gate Pass (`gatepass`) | DispatchScreen gatepass | Maint Material / SI (`gate_pass`) | **Partial** — sales GP vs maint GP are different tables | Keep separate by document type; rename clearly |
| Program create | PD → Program to Production | Program Card (Legacy) | — | **YES** | Retire legacy candidate |
| Job Card issue | Job Card Issue (Legacy) | PD program flow | — | **YES / overlapping** | Retire legacy candidate |
| Weft Yarn Issue | Production → Weft Yarn Issue | Production → Machine-wise (same `/weft`) | — | **YES — duplicate sidebar, same page** | Keep one menu label |
| Yarn Inward | Inventory → Yarn Inward OCR | Security → Yarn Inward OCR | SI Warp/Weft + Purchase Weft + WYM purchase | **YES — multi-entry paths** | Consolidation candidates |
| Warp beam / pipe stock | Warp Yarn Management | Warp Beam Pipe (Legacy) | Stock → Beam (Legacy) + `beam_pipe_stock` | **YES — layered eras** | Keep WYM; legacy candidates remove |
| Beam Remaining | Warp Yarn → Beam Remaining | Reports → Beam Remaining | — | Same page, dual menu | OK as deep link or pick one home |
| Sample Job Card | DTO → Sample Job Card | Standalone `sample-job-card` page | — | **YES — two issuers** | Merge to DESI/DTO path |
| Sample tracking / register | DTO Sample Tracking | Orders → Sample Register | — | **Partial** | Align on one register |
| Customer order entry | DTO Order Booking | Orders → Order Book | — | **YES — same `order_book` tables, two UIs** | Prefer DTO for DESI flow |
| “Orders & Pending” name | Orders & Pending (`orders` table) | Order Status / Order Book pending | — | **Naming collision**, different data | Rename pending module |
| Design Costing | DTO → DIN Costing | Reports → DIN Costing | Design Screen → open costing | Same engine, multi entry | One home: Design-wise Costing under Design to Order |
| Daily Costing vs Design Costing | Reports → Costing Report (`CostingScreen`) | Design-wise Costing page | — | **Different purpose**, easy to confuse | Keep both; rename Daily Costing clearly |
| Costing formula libs | `designWiseCosting.ts` | `designCosting.ts` | — | Parallel math libraries | Merge later |
| Repair Out / In | Maint → Repair (legacy) | Security → Repair Out/In | Maint Material Out/In | **YES — 3 flows** | Pick one repair workflow |
| Maint material inward | Inventory Consumables / Purchase maint_in | Security → Maint Material Inward | — | **YES** | Prefer Security as gate |
| General inward | Inventory → Inward (Purchase) | Security → General | — | **YES** | Same pattern |
| Payroll | HR & Payroll (canonical) | Admin → Payroll (Legacy Rates) | — | **Partial** | Keep HR; retire Admin payroll UI |
| Approvals queues | `approval_queue` | `pending_approvals` | Admin shows both | Dual systems | Unify later |
| Electricity | GEB Readings | Costing → Electricity (`electricity_entries`) | Settings “Preferences” → electricity | **YES — two meters** | One source of truth |
| Party lists | Party Master | CRM Customers | — | Intentional split | Keep separate; document |
| Design sharing | Design Broadcast | Design Catalog share | DTO Customer Promotion | Similar promo intent | Clarify roles |
| Design master | Orders → Design & Job Card | Masters → Design Master | — | Same screen, two menus | OK deep link |
| Employee Master | HR + Masters | — | Same | Dual menu | OK |
| DIN Costing label | Still “DIN Costing” everywhere | — | — | Terminology ≠ DESI / Design-wise Costing | Rename later (not now) |

## Exact examples (what is duplicated)

### Yarn Inward
- Security → Yarn Inward OCR → `yarn-inward`
- Inventory → Yarn Inward OCR → **same screen**
- Security Inventory → Warp / Weft tabs → write SI + warp/weft purchase/stock
- Warp Yarn Management → purchase / dual-write `yarn_inward`
- Purchase → Weft Yarn inward  

**Recommendation:** DO NOT change anything yet. Mark as candidates for consolidation.

### Production Entry
- Machine-wise Production → Entry
- Program & Dispatch → Entry
- Classic Production → Machine Entry  

**Same business action, three forms.**

### Sample Job Card
- Design to Order → Sample Job Card (`dto-sample-job`)
- Deep link → standalone Sample Job Card page  

**Two issuers / two table families (with optional mirror).**

### Which page contains the same function as which other page

| Same function | Page A | Page B |
|---------------|--------|--------|
| Production meters entry | Machine-wise Production → Entry | Program & Dispatch → Entry *(and legacy Production → Entry)* |
| Folding | Program & Dispatch → Folding | DispatchScreen → Folding *(unreachable)* |
| Challan | PD → Challan | DispatchScreen → Challan |
| Sales gate pass | PD → Gate Pass | DispatchScreen → Gatepass |
| Yarn OCR inward | Inventory → Yarn Inward OCR | Security → Yarn Inward OCR |
| Weft purchase/inward | Purchase → Weft | Security Inventory → Weft |
| Sample job issue | DTO Sample Job Card | Standalone Sample Job Card |
| Customer order entry | DTO Order Booking | Order Book → New Order |
| Design-wise costing | DTO → DIN Costing | Reports → DIN Costing *(same page)* |
| Repair out/in | Maint → Repair (legacy) | Security → Repair Out/In *(+ Material Out/In)* |
| Weft issue UI | Production → Machine-wise | Production → Weft Yarn Issue *(same route)* |

---

# TASK 4 — GROUP BY PROPOSED BUSINESS WORKFLOW

| Proposed module | Existing pages that fit |
|-----------------|-------------------------|
| 1. Dashboard | `home` |
| 2. Design to Order | dto-hub, dto-intake, design-wise-costing, dto-sample-job, dto-tracking, dto-promotion, dto-order-booking, dto-order-status, dto-followup, dto-reports; Design Screen link-in |
| 3. Program & Dispatch | program-dispatch (all PD subs); legacy programs / job cards (candidates) |
| 4. Production / Machine-wise | machine-wise-production; production legacy; PD entry/tracking (overlap) |
| 5. Warp Yarn Management | warp-yarn*; beam-remaining; warp-beam-pipe (legacy) |
| 6. Inventory / Security Inward | stock, purchase, yarn-inward, security-inventory*, security gate |
| 7. Attendance & Payroll | attendance, hr-payroll* |
| 8. Machine-wise Maintenance | maintenance*, maint-material |
| 9. Orders & Pending | orders-pending, order-book, order reports — **name conflict with DESI orders** |
| 10. Reports | reports hub deep links + dto/hr/pd/mwp reports |
| 11. Masters | parties, design, design-catalog, crm, placeholders |
| 12. Security | Overlaps heavily with #6 (SI + gate + admin PIN/approvals mixed into Security menu) |
| 13. Cash Book | cash-book |
| 14. Settings | placeholders + mis-linked electricity |

## Other / Needs Decision

| Item | Why |
|------|-----|
| Loan Tracker | Finance-ish; under Reports today |
| GEB / Electricity dual tables | Needs single home |
| Design Catalog vs Design Master vs Broadcast | Three design surfaces |
| CRM vs Party Master | Keep vs merge policy |
| Admin PIN / Permissions / Approvals | Under Security today — may belong Settings |
| Orders & Pending (`orders` table) | Not fabric order pipeline |
| Classic `DispatchScreen` | Orphan duplicate |
| Standalone Sample Job Card | Orphan relative to DTO |
| “Matching-wise” weft requirement wording | Rename vs keep as yarn-requirement (not costing) |

---

# TASK 5 — WHAT CAN BE COMPACTED (RECOMMENDATIONS ONLY)

## A. KEEP AS SEPARATE PAGE

| Page | Why |
|------|-----|
| Dashboard | Unique CEO cockpit |
| Design to Order Hub + Intake + Tracking + Follow-up + Promotion + DTO Reports | Core DESI pipeline |
| Design-wise Costing (`design-wise-costing`) | Canonical costing engine |
| Program & Dispatch (PTO→Invoice) | End-to-end sales execution |
| Machine-wise Production (Weft Issue + Entry + Report) | Weft/matching production specialty |
| Warp Yarn Management (all live tabs) | Current warp lifecycle |
| Security Inventory (gate categories) | Gate audit + sync |
| HR & Payroll suite + Attendance | Complete payroll chain |
| Machine-wise Maintenance (CMMS tabs) | Breakdown→history |
| Cash Book | Distinct ledger |
| Party Master | Order parties |
| Beam Remaining report | Specialized view |
| Daily Costing (`CostingScreen`) | Different from Design-wise — keep after rename |
| Loan Tracker | Distinct ledger (home TBD) |

## B. MOVE / MERGE INTO ANOTHER MODULE

| Page | Merge into | Why |
|------|------------|-----|
| Production sidebar Folding/Dispatch | Program & Dispatch only | Same screens already |
| Inventory Yarn Inward OCR + Purchase weft/maint/general as entry | Prefer Security Inventory as gate entry; Inventory as stock/reports | Multiple writers |
| Admin Payroll rates | HR Rate Master | Explicitly legacy |
| Legacy Program / Job Card | PD | Marked Legacy |
| Legacy Warp Beam Pipe / Stock beam | WYM | Marked Legacy |
| Design Screen costing open | Design to Order / Design-wise Costing | One costing home |
| Order Book entry | Design to Order Order Booking OR keep Order Book as adjust/report only | Dual order UIs |
| Sample Register | DTO Sample Tracking | Same business object family |
| GEB vs Costing electricity | One electricity module | Dual tables |
| Settings → System Preferences | Real settings or GEB | Wrong target today |
| Security menu Admin/PIN/Approvals | Settings (or keep Security for gate only) | Mixed concerns |
| Masters Item Master | Fix target or real item master | Points at Design Catalog |

## C. REMOVE DUPLICATE PAGE (CANDIDATES ONLY — DO NOT REMOVE YET)

| Page | Why |
|------|-----|
| `DispatchScreen` (`dispatch`) | Unreachable duplicate of PD folding/challan/GP |
| Standalone `SampleJobCard` page | Duplicate of DTO sample issue |
| Sidebar duplicate “Weft Yarn Issue” vs “Machine-wise Production” both `/weft` | Exact menu duplicate |
| Second “Yarn Inward OCR” menu under Security OR Inventory | Same screen twice |
| MaintenanceScreen repair OR SI maint-out OR maint-material | Pick one repair Out/In |
| `designCosting.ts` (lib) after confirming unused paths | Formula duplicate |
| Placeholder-only Settings/Masters stubs | Or implement — not remove until decided |

---

# TASK 6 — BUSINESS WORKFLOW VERIFICATION

## A) DESI → Design-wise Costing → Sample → Approved Matching → Customer Order → Program → Machine → Production → Folding/Checking → Dispatch → Invoice/Gate Pass

| Step | Exists? | Where | Multi-location? |
|------|---------|-------|-----------------|
| DESI Received | Yes (as **DIN** Intake) | `dto-intake` | — |
| Image | Yes | Intake + costing diary | — |
| Design-wise Costing | Yes (labeled **DIN Costing**) | `design-wise-costing` | Also Reports + Design Screen |
| Sample Job Card | Yes | `dto-sample-job` + standalone | **Duplicate** |
| Sample Received / Approve | Yes | `dto-tracking` | Sample Register partial |
| Approved Matching | Yes | `din_matchings` status | — |
| Customer Promotion | Yes | `dto-promotion` | Broadcast/Catalog similar |
| Customer Order | Yes | `dto-order-booking` + Order Book | **Duplicate UIs** |
| Program | Yes | PD PTO (+ legacy Program) | **Duplicate** |
| Machine / Production | Yes | MWP + PD Entry (+ legacy) | **Triple** |
| Folding/Checking | Yes | PD Folding (+ orphan Dispatch) | **Duplicate** |
| Dispatch | Yes | PD Challan | — |
| Invoice / Gate Pass | Yes | PD Invoice + Gate Pass | — |

## B) Warp Yarn

| Step | Exists? | Where | Notes |
|------|---------|-------|-------|
| Warp Yarn Purchase | Yes | WYM + SI warp | Multi |
| Yarn Stock | Partial | WYM pipes + legacy beam stock + yarn_inward | Layered |
| Empty Pipe | Yes | WYM `/empty` | — |
| Warper | Yes | WYM `/warper` | — |
| Beam Return | Yes | Warper return + machine return | — |
| Beam Stock / Machine Beam | Yes | godown + machines | — |
| Warp Consumption | Partial | `beam_loading` / daily_beam + remaining report | Not one dedicated page |
| Reports | Yes | WYM reports + Beam Remaining | — |

## C) Weft Yarn

| Step | Exists? | Where | Notes |
|------|---------|-------|-------|
| DESI/Design | Yes | DTO + costing | — |
| Program | Yes | PD | — |
| Matching-wise Weft Requirement | Yes | MWP Weft Issue (worded Matching-wise) | **Not** “Matching-wise Costing” |
| KG Calculation | Yes | Same DIN costing formulas | — |
| Weft Yarn Issue | Yes | MWP | — |
| Machine → Production → Balance | Yes | MWP entry + reports | Also PD entry |

## D) Security

| Step | Exists? | Where |
|------|---------|-------|
| Warp Outward | Yes | SI warp |
| Weft Inward | Yes | SI weft |
| Maint Material Inward | Yes | SI maint-in (+ Purchase) |
| Maint Repair Out / In | Yes | SI maint-out (+ legacy + material) |
| General / Others | Yes | SI |
| Gate Pass | Yes | PD `gatepass` + maint `gate_pass` |
| Security Reports | Yes | SI reports + Security Gate logs |

## E) Attendance & Payroll

Full chain exists under HR & Payroll + Attendance:
Employee Master → Rate Master → Attendance → Leave → Payroll → ESI/PF/PT → Salary Register → Payment → Bank Salary Letter → Reports.

Admin still has **legacy rates**. Bank Salary Letter exists.

## F) Maintenance

M1–M6 overview, breakdown workflow, contacts, repair/parts, service history, reports — **yes** in MachineWiseMaintenance.  
Legacy repair tracker still linked.

## G) Design to Order

Pipeline exists end-to-end under DTO; terminology still DIN; Gmail intake incomplete; costing labeled DIN Costing.

---

# TASK 7 — NAVIGATION / INTEGRITY ISSUES

| Issue | Detail |
|-------|--------|
| Unreachable page | `DispatchScreen` (`dispatch`) — coded, not in sidebar |
| Missing from sidebar | Standalone Sample Job Card; SI `documents` sub |
| Dead screen id | `settings-hub` never rendered |
| Duplicate sidebar entries | Yarn Inward OCR ×2; DIN Costing ×2; Beam Remaining ×2; Production Entry ×2 (different screens!); Repair Out/In ×2; Weft Issue = Machine-wise `/weft` |
| Wrong / misleading targets | Greige Stock → production report; Stock Adjustment → approvals; Item Master → Design Catalog; System Preferences → electricity costing; Machine Master → maint overview only |
| Incomplete / placeholder | Dept/Shift masters; Company/Shift/Notifications/Backup settings; Gmail DIN import stub |
| Terminology drift | DIN vs desired DESI; DIN Costing vs Design-wise Costing; Matching-wise weft (OK as yarn req) vs avoid Matching-wise Costing |
| Modules from different eras not connected cleanly | Phase 1–8 classics vs later DTO / PD / WYM / SI / MWP / HR — nav marks some Legacy but both remain live |
| Dual DB for same idea | `gatepass`/`gate_pass`; `electricity_entries`/`geb_readings`; `payroll_rates`/`salary_rates`; `approval_queue`/`pending_approvals`; beam stock generations |
| Bottom nav | Only first 4 `mobileNav` modules (Dashboard, Production, Inventory, Design to Order) — Program/Warp/HR etc. drawer-only |

---

# TASK 8 — FINAL SUMMARY

## Counts

| Metric | Count |
|--------|------:|
| 1. TOTAL MODULES (sidebar main) | **14** |
| 2. TOTAL PAGES (approx user-facing destinations) | **~95–110** labeled destinations; **~44** AppScreen ids; **~70+** meaningful screen+sub pages |
| 3. TOTAL DUPLICATE FUNCTIONS FOUND | **~28** distinct duplicate/overlap function groups |
| 4. TOTAL POSSIBLE DUPLICATE PAGES | **~18–22** page candidates |
| 5. PAGES MISSING FROM SIDEBAR | **`dispatch`**, **`sample-job-card`**, SI **`documents`**; dead **`settings-hub`** |
| 6. BROKEN / INCOMPLETE LINKS | **6 placeholders**; **4 misleading deep links**; Gmail stub; Item Master mis-target |

## Recommended final module structure (proposal only)

1. Dashboard  
2. Design to Order (DESI → Design-wise Costing → Sample → Order)  
3. Program & Dispatch  
4. Production / Machine-wise Production (Weft Issue + Entry + Reports)  
5. Warp Yarn Management  
6. Inventory (stock & reports) + Security Inward (gate entry) — clarify split  
7. Attendance & Payroll  
8. Machine-wise Maintenance  
9. Orders & Pending (**rename** non-sales pending list)  
10. Reports (deep links only)  
11. Masters  
12. Security (gate + logs) / move Admin to Settings  
13. Cash Book  
14. Settings (real)

## MERGE / KEEP / REMOVE recommendation table

| Item | Action | Why |
|------|--------|-----|
| Design-wise Costing page | **KEEP** (rename DIN→DESI later) | Canonical |
| Daily Costing | **KEEP** (rename) | Different job |
| DTO Sample Job | **KEEP** | DESI path |
| Standalone Sample Job Card | **REMOVE** candidate | Duplicate |
| Order Booking (DTO) | **KEEP** | DESI path |
| Order Book screen | **MERGE**/narrow to adjust+party report | Duplicate entry |
| PD Production Entry | **KEEP or MERGE with MWP Entry** | Decide single writer |
| MWP Production Entry | **KEEP or MERGE with PD** | Same |
| Legacy Production Entry / Job Card / Program Card | **REMOVE** candidates | Superseded |
| DispatchScreen | **REMOVE** candidate | Orphan duplicate of PD |
| Yarn Inward OCR (one menu home) | **KEEP** one | Drop duplicate menu |
| SI Warp/Weft as gate | **KEEP** | Security workflow |
| Purchase weft/maint as parallel entry | **MERGE** into SI or make view-only | Duplicate data entry |
| WYM | **KEEP** | Current warp system |
| Legacy beam pipe / beam stock | **REMOVE** candidates | Superseded |
| SI Repair Out/In | **KEEP** one repair flow | Drop legacy MaintenanceScreen repair OR merge |
| Maint Material screen | **MERGE** into SI/Maint | Overlap |
| HR Payroll | **KEEP** | Canonical |
| Admin Payroll tab | **REMOVE** candidate | Legacy |
| GEB Readings | **KEEP** one electricity home | Merge `electricity_entries` usage |
| Placeholders | **KEEP stubs or implement** | Incomplete, not duplicates |
| Matching-wise weft requirement | **KEEP function**; **rename label** away from “Matching-wise Costing” | Terminology |
| All DIN UI labels | **KEEP for now**; plan **DESI** rename | Per instruction — no change yet |

---

## Database overlap summary (for consultant)

| Domain | Overlapping tables |
|--------|--------------------|
| Beam / warp pipes | `beam_pipe_stock` + out/in → `warp_beam_pipe` → `warp_pipes` + transactions/purchases/warper |
| Warp yarn inward | `warp_yarn_inward` vs `yarn_inward` vs `warp_yarn_purchases` vs SI entries |
| Programs / orders | Sales: `order_book` → `programs`. Separate checklist: `orders` |
| Design costing | `designs` / `design_warp`/`design_weft` → `design_costing*` → `dins` hub |
| Samples | `sample_job_cards*` coexist with `din_sample_cards` |
| Parties | `party_master` vs `crm_customers` |
| Gate pass | `gatepass` (dispatch) vs `gate_pass` (maint material) |
| Approvals | `approval_queue` vs `pending_approvals` |
| Payroll rates | `payroll_rates` vs `salary_rates` |
| Electricity | `electricity_entries` vs `geb_readings` |
| Maintenance | early `maintenance_requests`/`repairing_tracker` vs CMMS `machine_breakdowns`/`maint_*` |

Approx **93 tables + 1 view** (`v_beam_remaining_report`).

---

## Explicit statement

**NO CHANGES WERE MADE.**

This audit is for review and decision only.

After consultant / ChatGPT review, send a clear KEEP / MERGE / REMOVE decision list before any compaction work begins.

---

*End of audit report.*
