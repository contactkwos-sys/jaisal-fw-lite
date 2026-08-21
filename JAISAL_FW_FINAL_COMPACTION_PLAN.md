# JAISAL FW — FINAL COMPACTION PLAN (FOR APPROVAL)

**Date:** 21 August 2026  
**Status:** PLAN ONLY — DO NOT IMPLEMENT  
**Based on:** `JAISAL_FW_AUDIT_REPORT.md` + CEO/owner instructions  

---

## CRITICAL RULES (LOCKED)

1. **Do not remove any business functionality.**
2. If two pages do the same job → **one canonical page**, preserve all useful fields, data, reports, workflows.
3. **Do not lose existing data.**
4. **Do not delete files / tables / routes / sidebar / deploy** until this plan is approved and a later implementation phase is authorized.
5. Technical DB fields (`din_number`, `dins`, `din_*`) **stay for now**; **user-facing labels** become **DESI** / **Design-wise Costing**.
6. Never name costing **“Matching-wise Costing”**. Matching-wise applies only to **yarn requirement / weft calculation**.

---

# 1. FINAL 14-MODULE STRUCTURE

| # | Final module name | Canonical role | Current nav id (today) | Planned nav id |
|---|-------------------|----------------|------------------------|----------------|
| 1 | Dashboard | CEO KPIs + shortcuts | `dashboard` | `dashboard` |
| 2 | Design to Order | DESI → Costing → Sample → Customer Order | `design-to-order` | `design-to-order` |
| 3 | Program & Dispatch | Order → Program → Folding → Dispatch → Invoice → GP | `program-dispatch` | `program-dispatch` |
| 4 | Machine-wise Production | Weft requirement/issue + Job Card + Production Entry + reports | `production` (hub mixes many things) | rename hub to **Machine-wise Production** (`machine-wise-production` module) |
| 5 | Warp Yarn Management | Pipe/beam/warper/godown/machine/remaining | `warp-yarn` | `warp-yarn` |
| 6 | Inventory | Stock / accounting / ledgers / stock reports | `inventory` | `inventory` |
| 7 | HR & Payroll | Attendance → payroll → bank letter | `hr-payroll` | `hr-payroll` |
| 8 | Machine-wise Maintenance | M1–M6 CMMS + one repair workflow | `maintenance` | `maintenance` |
| 9 | Orders & Pending | Internal pending list + sales order book/report (renamed carefully) | `orders` | `orders` (+ rename pending) |
| 10 | Reports | Reporting hub only (deep links) | `reports` | `reports` |
| 11 | Masters | True masters only | `masters` | `masters` |
| 12 | Security | Gate inward/outward/logs/GP/security reports | `security` | `security` |
| 13 | Cash Book | Cash ledger | `cash-book` | `cash-book` |
| 14 | Settings | Company / shift / notifications / backup / users / permissions | `settings` | `settings` |

**No extra top-level modules.**

### Sidebar composition (planned — not applied yet)

| Module | Planned sub-items (canonical) |
|--------|-------------------------------|
| Dashboard | (none) |
| Design to Order | DESI Intake · Design-wise Costing · Sample Job Card · Sample Tracking · Approved Matching (view/status) · Customer Promotion · Customer Order · Order Status · Order Follow-up · DTO Reports |
| Program & Dispatch | Program to Production · Job Card (canonical) · Production Tracking · Folding/Checking · Dispatch · Invoice · Gate Pass · Dispatch Reports · *(Legacy section, hidden or labeled)* |
| Machine-wise Production | Weft Yarn Requirement · Weft Yarn Issue · Machine-wise Job Card · Production Entry · Machine-wise Report · Shift-wise Report |
| Warp Yarn Management | Overview · Machine Beam · Godown · Empty Pipe · Warper · Beam Remaining · Warp Reports · *(Legacy Beam Pipe marked)* |
| Inventory | Yarn Stock · Greige Stock (real) · Consumables stock view · Stock Ledger/Adjustment (real) · Stock Reports · link to Warp Yarn *(not a second entry system)* |
| HR & Payroll | Dashboard · Employees · Attendance · Leave · Rate Master · Payroll · Statutory · Register · Payment · Bank Letter · Reports |
| Machine-wise Maintenance | Machine Overview (M1–M6) · Breakdown · Complaints · Maint Entry · Schedule · Service History · Spare Parts · Contacts · Repair Out/In (canonical) · Maint Reports |
| Orders & Pending | **Internal Purchase/Repair Pending** (renamed) · Order Book (report/adjust) · Design Master · Design Catalog · Design Broadcast · Sample Register (or absorb into DTO) |
| Reports | Deep links only to canonical sources |
| Masters | Party · Item (real) · Design · Machine · Employee · Department · Shift · CRM |
| Security | SI Dashboard · Warp In/Out · Weft In · Maint Material In · Repair Out/In (gate) · General · Others · Pending · Gate Logs · Security Reports · Approvals (gate/CEO) · GEB *(or move to Reports)* |
| Cash Book | Cash Book |
| Settings | Company · Shift · Notifications · Backup · System Preferences · User/PIN · Permissions |

---

# 2. MASTER ACTION TABLE

> Action codes: **KEEP** · **MERGE** · **REMOVE** *(only after migration)* · **RENAME** · **LEGACY** *(keep until merge complete)* · **FIX LINK** · **BUILD** *(missing true page)*

| Existing Page | Action | Canonical Page | Reason | Data Risk |
|---|---|---|---|---|
| Dashboard (`home`) | KEEP | Dashboard | CEO cockpit | None |
| Design to Order Hub (`dto-hub`) | KEEP + RENAME labels DIN→DESI | Design to Order Hub | Pipeline hub | Low (labels only) |
| DIN Intake (`dto-intake`) | RENAME → **DESI Intake** | DESI Intake | Terminology | Low |
| DIN Costing / DesignWiseCosting | RENAME → **Design-wise Costing**; KEEP single engine | Design-wise Costing | One costing system; also open from Dashboard | Low (UI); DB `din_number` stays |
| Reports → DIN Costing | MERGE menu (deep link only) | Design-wise Costing | Same page already | None |
| Design Screen → open costing | KEEP deep link | Design-wise Costing | Same engine | None |
| DTO Sample Job Card (`dto-sample-job`) | KEEP | Sample Job Card (DTO) | Canonical sample issuer | None |
| Standalone Sample Job Card (`sample-job-card`) | LEGACY → MERGE → REMOVE after migrate | DTO Sample Job Card | Duplicate issuer; preserve fields into DTO | **Medium** — two table families (`sample_job_cards*` vs `din_sample_cards`) |
| Sample Tracking (`dto-tracking`) | KEEP | Sample Tracking | Approve / receive | None |
| Sample Register (`sample-register`) | MERGE (read/history into Tracking or DTO) | Sample Tracking (+ history) | Overlapping sample log | Medium if tables diverge |
| Customer Promotion (`dto-promotion`) | KEEP | Customer Promotion | DESI share | None |
| Order Booking (`dto-order-booking`) | KEEP + RENAME → **Customer Order** | Customer Order | DESI customer order | None |
| Order Status (`dto-order-status`) | KEEP | Order Status | Pipeline status | None |
| Order Follow-up (`dto-followup`) | KEEP | Order Follow-up | Follow-ups | None |
| DTO Reports | KEEP | DTO Reports | DTO-only reports | None |
| Design Broadcast | KEEP (clarify role) | Design Broadcast | Marketing share ≠ approved matching promo | Low |
| Design Catalog | KEEP | Design Catalog | DNA catalog | None |
| Design Master / Design & Job Card (`design`) | KEEP + RENAME label | Design Master | Register; costing opens Design-wise Costing | None |
| Order Book (`orders` entry) | MERGE entry into Customer Order; KEEP report/adjust | Customer Order + Party Delivery Report | Same `order_book*` dual UI | **Medium** — fields must be unioned |
| Orders & Pending (`orders-pending`) | RENAME module page → **Internal Pending / Purchase-Repair Pending** | Same screen, new name | Different DB `orders` ≠ customer fabric order | Low if rename only |
| Program & Dispatch PTO | KEEP | Program to Production | Canonical program create | None |
| Program Card Legacy (`programs`) | LEGACY → MERGE → REMOVE after | Program to Production | Duplicate program create | Medium — ensure all program fields map |
| Job Card Legacy (`production` / `job`) | LEGACY → MERGE → REMOVE after | Machine-wise Job Card Issue (MWP) **and/or** PD Job Card step | Job card belongs with production; PD workflow still needs program link | **Medium–High** |
| PD Production Entry | MERGE into ONE entry | Machine-wise Production → Production Entry | Eliminate triple entry | **Medium** — must keep all entry fields from all 3 UIs |
| MWP Production Entry | KEEP as **canonical Production Entry** | MWP Production Entry | Chosen single writer to `production_entries` | Low if others redirect |
| Legacy Production Entry (`production` / `entry`) | LEGACY → MERGE → REMOVE after | MWP Production Entry | Third duplicate | Medium |
| PD Production Tracking | KEEP | Production Tracking | Canonical tracking | None |
| PD Folding | KEEP | Folding & Checking | Canonical | None |
| PD Challan / Dispatch | KEEP | Dispatch | Canonical | None |
| PD Invoice | KEEP | Invoice | Canonical | None |
| PD Gate Pass | KEEP | Sales / Dispatch Gate Pass (`gatepass`) | Canonical sales GP | None |
| DispatchScreen (`dispatch`) orphan | LEGACY → MERGE → REMOVE after | PD Folding / Challan / Gate Pass | Unreachable duplicate | Medium — migrate any orphan records if used historically |
| PD Reports | KEEP | Dispatch Reports | Canonical | None |
| MWP Weft Issue + Machine-wise hub | KEEP + expand | Machine-wise Production | Canonical weft + job + entry | Low |
| Production sidebar Weft Yarn Issue (dup menu) | REMOVE menu dup | MWP Weft Issue | Same route `/weft` | None |
| Production sidebar Folding / Dispatch | REMOVE from MWP hub; deep-link only from PD | Program & Dispatch | Wrong module home | None |
| Production sidebar Warp Issue | REMOVE from MWP hub; deep-link Warp Yarn | Warp Yarn → Machine Beam | Wrong module home | None |
| Shift-wise report (`production` / `report`) | MERGE into MWP reports | MWP Shift-wise Report | One report home | Low |
| Greige Stock (false link) | FIX LINK / BUILD real greige view | Inventory → Greige Stock (new or production stock report) | Currently opens production report | Medium if greige not stored distinctly |
| Warp Yarn Management (all live tabs) | KEEP | Warp Yarn Management | Canonical warp system | None |
| Beam Remaining | KEEP | Beam Remaining (under WYM; Reports deep link OK) | Required meters remaining | None |
| Warp Beam Pipe Legacy | LEGACY → MERGE → REMOVE after | WYM Warper / Empty / Godown | Legacy OUT/IN | **Medium** — dual-write already exists; migrate remaining rows |
| Stock → Beam (Legacy) | LEGACY → MERGE → REMOVE after | WYM Empty / Godown | Old `beam_pipe_stock` | Medium |
| Yarn Stock (`stock` / `weft`) | KEEP | Inventory → Yarn Stock | Accounting stock | None |
| Yarn Inward OCR | KEEP **one home** under Security (helper) OR Inventory OCR tool | Security SI / OCR assist → updates Inventory | Gate vs stock rule | Low if one entry path |
| Inventory Yarn Inward OCR menu | MERGE menu away | Security Yarn Inward (OCR assist) | Duplicate menu | None |
| Purchase Weft entry | MERGE entry path → Security Weft Inward; Purchase becomes stock/accounting view if needed | Security → Weft Inward → auto stock | Canonical gate entry | **Medium** |
| Purchase Maint In / Consumables entry | MERGE entry → Security Maint Material Inward | Security → Maint In → Inventory stock | Same | Medium |
| Purchase General entry | MERGE entry → Security General Inward | Security → General → Inventory | Same | Medium |
| Purchase Report | KEEP under Inventory Stock Reports | Stock Reports | Accounting reports | None |
| Security Inventory (all SI tabs) | KEEP as gate entry | Security Inventory | Physical gate record | None |
| Security Gate Logs | KEEP | Security Gate Logs | Consolidated logs | None |
| SI Repair Out/In | MERGE with Maint Material + Legacy Repair into **one repair workflow** | Canonical Repair Out/In (see §7) | Same business function where overlapping | **High** — three UIs / two GP tables |
| Maint Material Out/In | MERGE into canonical repair/material workflow | Canonical Repair / Material + `gate_pass` | Preserve auto GP | High |
| MaintenanceScreen repair legacy | LEGACY → MERGE → REMOVE after | Canonical Repair Out/In | Legacy tracker | Medium |
| MachineWiseMaintenance (CMMS) | KEEP + strengthen M1–M6 history | Machine-wise Maintenance | Canonical CMMS | None |
| HR Payroll full suite | KEEP | HR & Payroll | Canonical payroll | None |
| Attendance | KEEP | Attendance | Canonical | None |
| Admin Payroll (legacy rates) | MERGE → REMOVE after | HR → Salary Rate Master | Two rate systems | Medium — map `payroll_rates` → `salary_rates` |
| Admin Roles / PIN | MOVE menu to Settings | Settings → User/PIN | Not gate security | Low |
| Admin Permissions | MOVE menu to Settings | Settings → Permissions | One permission system | Low |
| Admin Approvals | KEEP under Security (CEO queue) **or** Settings; pick one home | Security → Approvals *(recommended)* | Dual queues still exist | Medium (two approval tables) |
| GEB Readings | KEEP | GEB Electricity (Reports + optional Security entry) | Meter readings | None |
| CostingScreen electricity (`electricity_entries`) | MERGE into GEB or Daily Costing read-from-GEB | GEB Readings | Dual electricity | **Medium** |
| Daily Costing (`costing` / summary) | KEEP + RENAME → **Daily Factory Costing** | Daily Factory Costing | ≠ Design-wise Costing | Low |
| Loan Tracker | KEEP under Reports | Loan Tracker | Distinct ledger | None |
| Cash Book | KEEP | Cash Book | Distinct | None |
| Party Master | KEEP | Party Master | Sales parties | None |
| CRM Customers | KEEP | CRM Customer Master | WhatsApp targets | None |
| Masters Item Master → Design Catalog | FIX LINK | Real Item Master (BUILD) or Inventory Item Master | Misleading | **CEO decision** if new master needed |
| Masters Machine Master → maint overview | FIX / KEEP as deep link labeled correctly | Machine Overview | OK if labeled “Machine Overview” | Low |
| Masters Employee → HR | KEEP deep link | HR Employee Master | OK | None |
| Dept / Shift Master placeholders | BUILD later under Masters/Settings | Department / Shift Master | Incomplete | None until built |
| Settings placeholders | KEEP stubs; FIX Preferences link | Company / Shift / Notifications / Backup / Preferences | Remove electricity mis-link | Low |
| Settings → System Preferences → electricity | FIX LINK | Real System Preferences (or remove until built) | Misleading | None |
| `settings-hub` dead screen | REMOVE dead id later | Settings module-hub | Unused | None |
| SI `documents` sub | KEEP + ADD sidebar if useful | Security → Documents | Missing from sidebar | Low |

---

# 3. CANONICAL PAGE FOR EVERY DUPLICATE FUNCTION

| Function | Canonical page (final) | Absorb / retire |
|----------|------------------------|-----------------|
| DESI intake | DESI Intake | — |
| Design-wise Costing | Design-wise Costing (`design-wise-costing`) | Reports deep link; Design Master deep link; Dashboard shortcut |
| Sample Job Card | DTO Sample Job Card | Standalone Sample Job Card |
| Sample tracking/register | Sample Tracking | Sample Register (history merge) |
| Customer fabric order entry | Customer Order (DTO) | Order Book entry UI |
| Order book party delivery / adjust | Order Book → Party Report / Adjust | — |
| Internal pending list | Renamed Internal Pending | Keep `orders` table separate |
| Program create | Program to Production (PD) | Legacy Program Card |
| Job Card issue | Machine-wise Job Card Issue (MWP) linked to program | Legacy Job Card; ensure PD workflow still sees job |
| Production Entry | **MWP Production Entry only** | PD Entry + Legacy Entry |
| Production Tracking | PD Tracking | — |
| Folding/Checking | PD Folding | DispatchScreen folding |
| Dispatch Challan | PD Challan | DispatchScreen challan |
| Sales Gate Pass | PD Gate Pass (`gatepass`) | DispatchScreen gatepass |
| Maint Gate Pass | Canonical Repair/Material (`gate_pass`) | Do not merge with sales GP table |
| Weft yarn requirement / issue | MWP Weft tabs | Dup sidebar label |
| Shift / machine production reports | MWP Reports | Legacy production report |
| Warp lifecycle | Warp Yarn Management | Legacy beam pipe + beam stock |
| Beam remaining | Beam Remaining | Reports deep link OK |
| Yarn / Weft / Maint / General inward **entry** | Security Inventory tabs (+ OCR assist) | Purchase entry UIs become secondary/accounting or retired after auto-post |
| Yarn stock accounting | Inventory Yarn Stock | — |
| Stock reports | Inventory Stock Reports | — |
| Repair Out/In | **One canonical repair workflow** (see §7) | Legacy repair + SI repair + material overlap |
| CMMS breakdown/history | Machine-wise Maintenance | — |
| Payroll calc + rates | HR & Payroll | Admin legacy payroll |
| Attendance | Attendance | — |
| Daily factory costing | Daily Factory Costing | Distinct from Design-wise |
| Electricity meter | GEB Readings | `electricity_entries` merge |
| Users / PIN / permissions | Settings | Move from Security menu |
| CEO approvals | Security → Approvals (recommended) | Unify queues later |

---

# 4. MODULE-BY-MODULE PLAN

## 4.1 Dashboard
- **KEEP**
- Shortcuts must open **Design-wise Costing** (same engine) and other canonical modules
- No duplicate costing

## 4.2 Design to Order
**User-facing names (RENAME):**

| Current | Final |
|---------|-------|
| DIN Intake | DESI Intake |
| DIN Costing | Design-wise Costing |
| Sample Job Card | Sample Job Card |
| Sample Tracking | Sample Tracking |
| (matching approve) | Approved Matching *(status within Tracking / Hub)* |
| Customer Promotion | Customer Promotion |
| Order Booking | Customer Order |
| Order Follow-up | Order Follow-up |

- Canonical costing = existing `DesignWiseCosting` / `design_costing*`  
- Accessible from Design to Order **and** Dashboard  
- **Do not** create a second costing system  
- Merge standalone Sample Job Card → DTO after data mapping

## 4.3 Program & Dispatch
**Canonical workflow:**

Customer Order → Program to Production → Job Card → Production Tracking → Folding/Checking → Dispatch → Invoice → Gate Pass

| Legacy page | Mark as | Target |
|-------------|---------|--------|
| Program Card (Legacy) | LEGACY → MERGE | Program to Production |
| Job Card Issue (Legacy) | LEGACY → MERGE | Machine-wise Job Card (linked to program) |
| DispatchScreen | LEGACY → MERGE | PD Folding / Challan / Gate Pass |

**Do not delete legacy until migration checklist signed.**

**Note:** Production Entry is **not** kept as a second PD page — redirect to MWP Production Entry (or embed same component).

## 4.4 Machine-wise Production
Must contain (A–J):

| Letter | Capability | Plan |
|--------|------------|------|
| A | Program-linked Weft Yarn Requirement | KEEP / strengthen in MWP |
| B | Matching-wise yarn calculation | KEEP (not costing) |
| C | Actual KG from DESI + matching + colours + programmed meters | KEEP (from Design-wise Costing weft rows) |
| D | Weft Yarn Issue | KEEP |
| E | Machine-wise Job Card Issue | MERGE from legacy Job Card into MWP |
| F | Print | KEEP |
| G | WhatsApp | KEEP |
| H | Production Entry | **ONE canonical** (absorb PD + legacy) |
| I | Machine-wise Production Report | KEEP |
| J | Shift-wise Production Report | MERGE from legacy production report |

Remove from this module’s sidebar: Folding, Dispatch, Warp Issue (those belong to PD / Warp Yarn).

## 4.5 Warp Yarn Management
- **KEEP** current WYM as canonical  
- LEGACY merge: Warp Beam Pipe, Stock Beam  
- Preserve: pipe, beam, warper, godown, machine beam, return, loading, remaining meter, reports  

## 4.6 Inventory vs Security (do not fully merge)

| Layer | Responsibility |
|-------|----------------|
| **Security** | Physical gate inward/outward record (SI) |
| **Inventory** | Stock/accounting/ledgers/reports |

**Rule:** Security save → **auto-update** Inventory / Warp / Weft / Maint stock tables (already partially true; make this the only entry path).

| Transaction | Canonical entry | Inventory effect |
|-------------|-----------------|------------------|
| Yarn Inward (OCR assist OK) | Security (Warp/Weft + OCR) | yarn / warp / weft stock |
| Weft Inward | Security → Weft | `weft_yarn_stock` + ledger |
| Maint Material Inward | Security → Maint In | maint/inventory stock |
| General Inward | Security → General | general / item stock |
| Repair Out/In | Canonical repair (gate + maint) | material + `gate_pass` |

Purchase screens: after migration, become **reports / accounting views** or CEO-approved retirement.

## 4.7 Machine-wise Maintenance
- KEEP CMMS for Machines 1–6 with per-machine history/status  
- Track: Electrical / Mechanical / Other / Complaint / Breakdown / Contact / Mobile 1–2 / Call / Arrival / Completed / Done by / Parts / Payment / Cost / Service history  

**Canonical repair workflow (proposed):**
1. Breakdown / Complaint opens on machine (CMMS)  
2. If part goes out for repair → **Repair Out** creates Security gate record + `gate_pass`  
3. Repair In closes gate + updates parts/payment/history  
4. Material Out/In without full breakdown uses same gate+material engine  

| Current | Action |
|---------|--------|
| MachineWiseMaintenance | KEEP (core) |
| SI Repair Out/In | MERGE into canonical repair (gate half) |
| Maint Material Out/In | MERGE (material/GP half) |
| Legacy MaintenanceScreen repair | LEGACY → MERGE → REMOVE after |

**Do not lose gate-pass functionality** (`gate_pass` for maint; `gatepass` for sales stay separate).

## 4.8 HR & Payroll
- Canonical payroll = HR & Payroll  
- MERGE Admin legacy rates → Salary Rate Master  
- One calculation system only  

## 4.9 Orders
| Concept | Table | Final name | Action |
|---------|-------|------------|--------|
| A. Customer fabric/design order | `order_book*` | Customer Order (DTO) + Order Book reports | KEEP separate from B |
| B. General internal pending | `orders` | **Internal Pending** (suggested) / Purchase-Repair Pending | RENAME only first |

**Do not merge databases A and B.**

DESI chain stays: DESI → Customer Order → Program → Production → Dispatch.

## 4.10 Reports
- Hub of deep links only  
- Rename “DIN Costing” → “Design-wise Costing”  
- Rename “Costing Report” → “Daily Factory Costing”  
- No new data-entry pages inside Reports  

## 4.11 Masters
| Master | Action |
|--------|--------|
| Party Master | KEEP |
| Item Master | **FIX** — must NOT open Design Catalog; BUILD real Item Master (use `inventory_item_master` or CEO-approved design) |
| Design Master | KEEP (`design`) |
| Design Catalog | KEEP (not Item Master) |
| Machine Master | Deep link to Machine Overview **or** thin master later |
| Employee Master | Deep link HR |
| Department / Shift | BUILD later |
| CRM Customer Master | KEEP |

## 4.12 Security
Gate Inward/Outward, Gate Pass (maint), Logs, Reports, Approvals.  
Move User/PIN + Permissions → **Settings**.

## 4.13 Cash Book
KEEP as-is.

## 4.14 Settings
Clean structure:
- Company · Shift · Notifications · Backup · System Preferences · User/PIN · Permissions  
- **Remove** Preferences → Electricity mis-link  
- Do not implement empty placeholders until required  

---

# 5. DATABASE TABLES AFFECTED BY EACH MERGE

| Merge | Tables touched | Migration approach |
|-------|----------------|--------------------|
| Sample Job Card dual | `din_sample_cards`, `sample_job_cards`, `sample_matchings`, `sample_matching_colours` | Map standalone cards → DESI sample cards; keep old rows read-only until verified |
| Order Book vs Customer Order | `order_book`, `order_book_items` | UI merge only; same tables |
| Internal Pending rename | `orders` | Label only |
| Program legacy | `programs`, `program_petty` | UI retire; data already shared |
| Job Card legacy | `job_cards`, `job_card_colours` | Ensure MWP/PD write same tables; migrate missing fields |
| Production Entry ×3 | `production_entries` | Single UI writer; no table drop |
| DispatchScreen | `folding_entries`, `challans`, `gatepass` | Confirm PD already covers; archive UI |
| Warp legacy | `warp_beam_pipe`, `beam_pipe_stock`, `beam_pipe_out/in` → `warp_pipes`, `warp_yarn_transactions`, `warp_warper_jobs`, `warp_yarn_purchases` | Finish migration; keep old tables read-only |
| Yarn/Weft inward multi-path | `yarn_inward`, `weft_purchases*`, `weft_yarn_stock`, `yarn_stock_ledger`, `security_inventory_*`, `warp_yarn_purchases` | Single entry → multi-table post (already patterned in SI) |
| Maint/general inward | `maintenance_inward*`, `general_purchases*`, `inventory_item_*`, SI | Same |
| Repair triple | `repairing_tracker`, `maintenance_material`, `gate_pass`, SI entries, `machine_breakdowns*` | Design one workflow writing all needed fields |
| Payroll rates | `payroll_rates` → `salary_rates` | Copy missing rates; HR reads one source |
| Approvals dual | `approval_queue`, `pending_approvals` | Unify later (CEO) |
| Electricity dual | `electricity_entries` → `geb_readings` | Import or dual-read then freeze old |
| Costing libs | `design_costing*` (keep); `design_warp`/`design_weft` may remain historical | No drop; Design-wise Costing stays canonical |
| DESI rename | UI only; keep `dins`, `din_matchings`, `din_number` | No DB rename in phase 1 |

**Hard rule:** No DROP TABLE in compaction phase 1–2. Archive UI first; drop only in a later CEO-approved cleanup.

---

# 6. DATA MIGRATION RISKS

| Risk level | Item | Why | Mitigation |
|------------|------|-----|------------|
| HIGH | Repair Out/In triple merge | Different tables + two gate pass systems | Field-by-field matrix; dual-write period; no delete |
| HIGH | Job Card home move | Legacy job cards may lack program/DESI links | Backfill program_id / din_number where possible |
| MEDIUM | Sample Job Card dual | Two sample families | Import script + verification report |
| MEDIUM | Production Entry merge | Three forms, different fields | Union field list before UI cutover |
| MEDIUM | Warp legacy tables | Historical pipes may not be in `warp_pipes` | Migration + remaining-count reconcile |
| MEDIUM | Purchase vs Security inward | Historical purchases without SI rows | Keep Purchase read-only history |
| MEDIUM | Payroll rate dual | Costing may still read `payroll_rates` | Update costing to HR rates after copy |
| MEDIUM | Electricity dual | Daily Costing uses old table | Point Daily Costing to GEB |
| LOW | Terminology DESI | User confusion during transition | Show “DESI (formerly DIN)” briefly |
| LOW | Menu deep-link cleanup | Wrong targets | Fix links without data move |
| CEO | Item Master rebuild | No true item master page | Approve source of truth |
| CEO | Internal Pending new name | Naming for floor users | Approve label |
| CEO | Where Production Entry lives if operators only open PD | Role UX | Approve redirect vs embed |
| CEO | Approvals home (Security vs Settings) | Access pattern | Approve |
| CEO | Whether Purchase entry UI is fully retired | Accounts habit | Approve |

---

# 7. NAVIGATION & SIDEBAR CHANGES REQUIRED (PLANNED)

### Structural
1. Rename top module **Production** → **Machine-wise Production**  
2. Reorder modules to the approved 14-list (Dashboard, Design to Order, Program & Dispatch, Machine-wise Production, …)  
3. Strip cross-module clutter from Machine-wise Production hub (no Folding/Dispatch/Warp Issue as primary homes)  
4. Security: remove User/PIN/Permissions → Settings  
5. Inventory: remove duplicate Yarn Inward OCR if Security owns gate OCR; remove false Greige/Stock Adj targets until real pages exist  
6. Reports: labels only + deep links  
7. Masters: fix Item Master  
8. Settings: fix Preferences mis-link  
9. Add SI Documents to sidebar if kept  
10. Mark legacy items: `LEGACY — use …` until removal phase  

### Terminology in nav
- DIN Intake → DESI Intake  
- DIN Costing → Design-wise Costing  
- Order Booking → Customer Order  
- Orders & Pending (internal) → approved new name  

### Unreachable today
- Wire or retire `DispatchScreen` via merge plan (do not leave silent orphan)

---

# 8. PAGES THAT BECOME LEGACY (KEEP UNTIL MIGRATION DONE)

| Legacy page | Until |
|-------------|-------|
| Program Card (Legacy) | Program field parity verified in PD |
| Job Card Issue (Legacy) | MWP Job Card parity + historical print |
| DispatchScreen | PD covers all historical challan/GP/folding cases |
| Warp Beam Pipe (Legacy) | All open OUT rows closed / migrated |
| Stock Beam (Legacy) | Counts match WYM |
| Standalone Sample Job Card | All cards visible under DESI Sample |
| Admin Payroll rates tab | Rates copied to Salary Rate Master |
| MaintenanceScreen repair | Canonical repair handles open tickets |
| Purchase Weft/Maint/General **entry** (optional legacy) | Security auto-post proven |
| `electricity_entries` UI | GEB is sole meter entry |

---

# 9. PAGES SAFELY REMOVABLE ONLY AFTER MIGRATION

*(Still DO NOT remove now)*

1. DispatchScreen file/route  
2. Standalone SampleJobCard page  
3. ProgramScreen (if fully superseded)  
4. ProductionScreen job/entry tabs (if reports moved)  
5. WarpBeamPipeScreen  
6. Stock beam legacy tab  
7. Admin payroll tab  
8. MaintenanceScreen (repair-only mount)  
9. Duplicate sidebar entries (weft issue dup, yarn OCR dup)  
10. Dead `settings-hub` type  

**Never remove in same release as migration without CEO sign-off + backup.**

---

# 10. TERMINOLOGY CHANGES (PHASE 1 — UI ONLY)

| From | To |
|------|----|
| DIN | DESI |
| DIN Intake | DESI Intake |
| DIN Costing / DIN Costing rates | Design-wise Costing |
| Order Booking | Customer Order |
| Matching-wise Costing *(if any)* | **Forbidden** — use Design-wise Costing |
| Matching-wise yarn requirement | Allowed (yarn calc only) |
| Costing Report (daily) | Daily Factory Costing |

**DB unchanged:** `din_number`, `dins`, `din_matchings`, `din_sample_cards`, etc.

---

# 11. SUGGESTED IMPLEMENTATION PHASES (AFTER APPROVAL ONLY)

| Phase | Scope | Deletes? |
|-------|-------|----------|
| 0 | Approval this plan | No |
| 1 | UI terminology DESI + Design-wise Costing; sidebar reorder/relabel; fix misleading links | No |
| 2 | Single Production Entry (shared component); PD entry redirects | No |
| 3 | Security = sole inward entry; Inventory stock views; Purchase entry soft-legacy | No |
| 4 | WYM absorb beam legacy (read-only old) | No |
| 5 | Sample Job Card merge | No table drop |
| 6 | Canonical repair workflow + gate_pass preserved | No |
| 7 | HR rates merge; electricity merge | No |
| 8 | Hide legacy menus | No |
| 9 | CEO-approved file/table cleanup | Only then |

---

# 12. UNRESOLVED — REQUIRES CEO APPROVAL

| # | Decision needed | Options |
|---|-----------------|---------|
| 1 | Final English name for internal `orders` pending module | e.g. “Internal Pending”, “Store/Repair Pending”, “Factory Pending List” |
| 2 | Item Master source of truth | New UI on `inventory_item_master` vs yarn+consumable masters only |
| 3 | Production Entry UX for Program Supervisor | Redirect to MWP vs embed MWP entry inside PD |
| 4 | Job Card primary home | MWP only vs also a PD step screen (same data) |
| 5 | Fully retire Purchase entry screens? | Soft-legacy forever vs remove after 30/60 days |
| 6 | Approvals menu home | Security vs Settings |
| 7 | GEB entry home | Security + Reports vs Reports only |
| 8 | Design Broadcast vs Customer Promotion | Keep both (recommended) vs merge messaging |
| 9 | Sample Register | Merge into Sample Tracking vs keep as archive report |
| 10 | When to drop legacy tables | Never in 2026 vs after N months freeze |
| 11 | Show “DESI (formerly DIN)” transition label? | Yes/No |
| 12 | Mobile bottom-nav which 4 modules | Confirm order after reorder |

---

# 13. EXECUTIVE COUNTS (PLAN TARGETS)

| Metric | Count (approx) |
|--------|----------------|
| Final top-level modules | **14** (unchanged count; Production hub renamed to Machine-wise Production) |
| Pages/sub-pages remaining as primary homes | **~55–65** |
| Pages merged into a canonical page | **~20–25** |
| Pages marked LEGACY (temporary) | **~10–12** |
| Duplicate functions eliminated (after full plan) | **~25–28** |
| Immediate deletions in this phase | **0** |
| Items requiring CEO approval before coding | **12** (section 12) |

### Short executive summary

- **Remain:** ~55–65 primary pages under 14 modules (cleaner homes, fewer duplicates).  
- **Merge:** ~20–25 pages/flows into canonical pages (entry UIs, legacy program/job/dispatch/beam/sample/repair/payroll/electricity).  
- **Legacy (temporary):** ~10–12 screens kept visible or hidden-but-alive until migration checklists pass.  
- **Duplicate functions eliminated:** ~25–28 (Production Entry×3, Yarn Inward multi-path, Sample Job×2, Order entry×2, Repair×3, etc.).  
- **CEO approval needed on:** internal pending name, Item Master, Production Entry/Job Card UX homes, Purchase retirement, Approvals/GEB homes, Broadcast vs Promotion, Sample Register, table-drop timing, DESI transition label, mobile nav.

---

## STOP

**No application code, database, routes, sidebar, or deployment changes have been made in this plan phase.**

Awaiting approval of:
1. This compaction plan  
2. CEO decisions in §12  

Only then start Phase 1 implementation.

---

*End of JAISAL_FW_FINAL_COMPACTION_PLAN.md*
