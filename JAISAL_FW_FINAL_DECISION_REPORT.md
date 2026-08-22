# JAISAL FW — FINAL DECISION REPORT  
## Duplicate / Overlap Audit · KEEP / MERGE / KEEP SEPARATE / LEGACY / REMOVE-LATER

**Date:** 21 August 2026  
**Status:** AUDIT / DECISION DOCUMENT ONLY  
**Authority sources:**  
- `JAISAL_FW_AUDIT_REPORT.md`  
- `JAISAL_FW_FINAL_COMPACTION_PLAN.md`  
- `JAISAL_FW_CEO_DECISION_SHEET.md`  
- Current software state (modules, pages, tables, workflows)

---

## HARD RULES (LOCKED)

| Rule | Decision |
|------|----------|
| Daily Costing / Daily P&L vs Design-wise Costing | **KEEP SEPARATE** forever (different purpose; different engines) |
| Design-wise Costing vs Matching-wise Weft Yarn Requirement | **KEEP SEPARATE** (costing ≠ yarn issue KG calc) |
| Business data | Never delete |
| Database tables | Never DROP without new explicit CEO approval |
| `din_number` / `dins` / `din_*` columns | Keep technical names for now; UI = **DESI** |
| This document | **NO CODE / DB / SIDEBAR / DEPLOY** actions |

---

## 1. FINAL 14-MODULE STRUCTURE (LOCKED)

| # | Module | Verdict |
|---|--------|---------|
| 1 | Dashboard | **KEEP** |
| 2 | Design to Order (DESI) | **KEEP** |
| 3 | Program & Dispatch | **KEEP** |
| 4 | Machine-wise Production | **KEEP** |
| 5 | Warp Yarn Management | **KEEP** |
| 6 | Inventory | **KEEP** (stock/accounting) |
| 7 | HR & Payroll | **KEEP** |
| 8 | Machine-wise Maintenance | **KEEP** |
| 9 | Orders (Internal Pending + Order Book report) | **KEEP** (renamed concepts) |
| 10 | Reports | **KEEP** (hub / deep links only) |
| 11 | Masters | **KEEP** |
| 12 | Security | **KEEP** (gate inward/outward) |
| 13 | Cash Book | **KEEP** |
| 14 | Settings | **KEEP** |

Do **not** invent additional top-level modules.

---

## 2. COSTING SYSTEMS (CRITICAL)

| System | Screen / tables | Purpose | Decision |
|--------|-----------------|---------|----------|
| **Design-wise Costing** | `design-wise-costing` · `design_costing*` · formulas in `designWiseCosting.ts` | DESI / design diary → final ₹/meter | **KEEP** (canonical design costing) |
| **Daily Factory Costing / Daily P&L** | `costing` · salary/yarn/elec/maint vs billing | Day-level factory P&L | **KEEP SEPARATE** from Design-wise |
| Matching-wise Weft Yarn Requirement | MWP Weft Issue · `machine_weft_issues*` · uses costing weft rows for KG only | Program-linked weft issue | **KEEP SEPARATE** from both costing names |
| Old Design Master formula lib `designCosting.ts` | Math helper (if still referenced) | Legacy formula parallel | **LEGACY** → **REMOVE-LATER** only after zero references |

**Forbidden name:** “Matching-wise Costing”  
**Correct names:** Design-wise Costing · Daily Factory Costing · Matching-wise Weft Yarn Requirement

---

## 3. COMPLETE PAGE / FUNCTION DECISION TABLE

Action codes: **KEEP** · **MERGE** · **KEEP SEPARATE** · **LEGACY** · **REMOVE-LATER**

### 3.1 Dashboard

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| CEO Dashboard | KEEP | Dashboard | Shortcuts to Design-wise Costing OK (same engine) |

### 3.2 Design to Order / DESI workflow

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Design to Order Hub | KEEP | Design to Order | Pipeline hub |
| DESI Intake (was DIN Intake) | KEEP | DESI Intake | UI DESI; DB `dins` unchanged |
| Design-wise Costing | KEEP | Design-wise Costing | One engine; also deep-linked from Dashboard/Reports |
| Sample Job Card (DTO) | KEEP | DTO Sample Job Card | Canonical sample issuer |
| Sample Tracking | KEEP | Sample Tracking | Produce / receive / approve |
| Approved Matching (status) | KEEP | Inside Sample Tracking / Hub | Not a separate costing |
| Customer Promotion | KEEP | Customer Promotion | |
| Design Broadcast | KEEP SEPARATE | Design Broadcast | Different stage from Promotion |
| Customer Order (DTO) | KEEP | Customer Order | Primary fabric order entry |
| Order Status | KEEP | Order Status | |
| Order Follow-up | KEEP | Order Follow-up | |
| DESI Reports | KEEP | DESI Reports | |
| Standalone Sample Job Card page | LEGACY → REMOVE-LATER | DTO Sample Job Card | Preserve data in `sample_job_cards*` |
| Sample Register | KEEP (as Archive) | Sample Register (Archive) | Not live tracking |
| Design Master (`design`) | KEEP | Design Master | Opens Design-wise Costing |
| Design Catalog | KEEP SEPARATE | Design Catalog | Not Item Master |

**DESI chain (KEEP intact):**  
DESI Intake → Design-wise Costing → Sample Job Card → Sample Tracking / Approved Matching → Customer Promotion → Customer Order → Program → Machine → Production → Folding → Dispatch → Invoice / Gate Pass

### 3.3 Program & Dispatch

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Program to Production | KEEP | PD PTO | Canonical program create |
| Production Entry (PD UI) | MERGE (done conceptually) | MWP Production Entry | Same component/engine |
| Production Tracking | KEEP | PD Tracking | |
| Folding & Checking | KEEP | PD Folding | |
| Dispatch / Challan | KEEP | PD Challan | |
| Gate Pass (sales) | KEEP | PD Gate Pass (`gatepass`) | |
| Invoice | KEEP | PD Invoice | |
| Dispatch Reports | KEEP | PD Reports | |
| Program Card classic | LEGACY → REMOVE-LATER | Program to Production | Keep `programs` data |
| Classic DispatchScreen | LEGACY → REMOVE-LATER | PD Folding/Challan/GP | Do not delete until dependency check |
| Classic Job Card (as PD-only home) | MERGE home → MWP Job Card | Machine-wise Job Card | Same `job_cards*` tables |

### 3.4 Machine-wise Production & Weft Yarn Issue

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Weft Yarn Issue / Matching-wise requirement | KEEP | MWP → Weft | Uses Design-wise weft rows for KG; not a costing page |
| Machine-wise Job Card | KEEP | MWP → Job Card | |
| Production Entry (canonical) | KEEP | MWP → Entry | Single writer to `production_entries` |
| Machine-wise Report | KEEP | MWP → Report | |
| Shift-wise Production Report | KEEP | MWP / Production report | |
| Classic Production Entry | LEGACY → REMOVE-LATER | MWP Entry | |
| Duplicate “Weft Issue” menu pointing same route | MERGE (menu) | One Weft Yarn Issue item | Avoid two labels same page |

### 3.5 Warp Yarn Management

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Overview / Machines / Godown / Empty / Warper / Reports | KEEP | Warp Yarn Management | Canonical warp lifecycle |
| Beam Remaining | KEEP | Beam Remaining | Also Reports deep link OK |
| Warp Beam Pipe classic | LEGACY → REMOVE-LATER | WYM Warper / Empty / Godown | Keep `warp_beam_pipe` table |
| Beam stock variety (`beam_pipe_stock` UI) | LEGACY → REMOVE-LATER | WYM | Keep table |
| Warp purchase / transactions | KEEP | WYM + Security gate post | |

**Warp chain (KEEP):** Purchase → Stock/Pipes → Empty → Warper → Beam Return → Beam Stock → Machine Beam → Consumption / Remaining → Reports

### 3.6 Inventory vs Security (boundary)

| Rule | Decision |
|------|----------|
| Inventory module | **KEEP** = stock, ledgers, stock reports |
| Security module | **KEEP** = physical gate inward/outward |
| Full merge of Inventory + Security into one module | **KEEP SEPARATE** (do not merge modules) |

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Yarn Stock | KEEP | Inventory | |
| Stock Reports | KEEP | Inventory / Purchase report view | |
| Warp Yarn deep link from Inventory | KEEP | Opens WYM | Convenience only |
| Purchase Entry (Weft/Maint/General) | LEGACY → REMOVE-LATER | Security gate inward | Tables kept |
| Yarn Inward OCR | KEEP (one home) | Security | Assist at gate |
| Greige Stock false link | REMOVE-LATER / already hidden | Build real greige later if needed | |
| Security Inventory dashboard | KEEP | Security | |
| Warp In/Out (gate) | KEEP | Security SI Warp | Auto-updates WYM/Inventory |
| Weft Inward (gate) | KEEP | Security SI Weft | Canonical weft entry |
| Maint Material Inward (gate) | KEEP | Security SI Maint In | |
| Repair Out/In (gate) | KEEP | Security SI Maint Out | With `gate_pass` |
| General / Other Inward | KEEP | Security SI | |
| Pending / Documents / Security Reports | KEEP | Security | |
| Security Gate Logs | KEEP | Security Gate | |
| Approvals | KEEP | Security | |
| GEB Reading entry | KEEP | Security + Reports deep link | |

### 3.7 Maintenance Repair

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| Machine Overview M1–M6 | KEEP | Maintenance | |
| Breakdown / Complaints / Entry / Schedule / History / Spares / Contacts / Reports | KEEP | Maintenance | |
| Repair / Material Out·In (`maint-material`) | KEEP | Canonical material + auto `gate_pass` | |
| Security Repair Gate | KEEP | Gate half of repair | |
| Legacy Repair Tracker (`MaintenanceScreen` repair) | LEGACY → REMOVE-LATER | Material + SI + CMMS | Keep `repairing_tracker` data |
| Sales `gatepass` vs maint `gate_pass` | KEEP SEPARATE | Two document types | Do not merge tables |

**Repair target workflow (KEEP direction; deeper UI unify = remaining work):**  
Breakdown/Complaint → Repair Out (gate + material) → Arrival/Work → Parts/Payment → Repair In → Service History

### 3.8 HR & Payroll

| Existing Page / Function | Action | Canonical home | Notes |
|--------------------------|--------|----------------|-------|
| HR Dashboard / Employees / Attendance / Leave / Rates / Payroll / Statutory / Register / Payment / Bank Letter / Reports | KEEP | HR & Payroll | Canonical payroll |
| Admin Payroll Rates | LEGACY → REMOVE-LATER | Salary Rate Master | Keep `payroll_rates` until mapped |
| Dual rate tables | KEEP SEPARATE until CEO cleanup | `salary_rates` primary; `payroll_rates` legacy | No DROP |

### 3.9 Orders concepts (two databases)

| Concept | Table | Action |
|---------|-------|--------|
| Customer fabric / DESI order | `order_book*` | **KEEP** via Customer Order + Order Book report/adjust |
| Internal Pending list | `orders` | **KEEP SEPARATE** · UI name Internal Pending |
| Merge the two DBs | — | **DO NOT MERGE** |

| Existing Page / Function | Action | Canonical home |
|--------------------------|--------|----------------|
| Internal Pending | KEEP | Internal Pending |
| Order Book (report/adjust) | KEEP | Order Book |
| Classic Order Book as primary entry | LEGACY (entry role) | Customer Order is primary entry |

### 3.10 Reports

| Existing Page / Function | Action | Notes |
|--------------------------|--------|-------|
| Reports hub | KEEP | Deep links only — no new data-entry |
| Design-wise Costing link | KEEP | Same engine |
| Daily Factory Costing link | KEEP SEPARATE | Not Design-wise |
| Production / MWP / Stock / Party Delivery / Beam / GEB / Loan / Attendance | KEEP | Deep links to canonical sources |

### 3.11 Masters

| Existing Page / Function | Action | Notes |
|--------------------------|--------|-------|
| Party Master | KEEP | |
| Item Master (`inventory_item_master`) | KEEP | Must never open Design Catalog |
| Design Master | KEEP | |
| Design Catalog | KEEP SEPARATE | |
| Machine Overview (as master link) | KEEP | Label correctly |
| Employee Master deep link | KEEP | HR is source |
| Department / Shift Master | KEEP (placeholder until built) | |
| CRM Customer Master | KEEP SEPARATE from Party Master | |

### 3.12 Settings / Admin

| Existing Page / Function | Action | Notes |
|--------------------------|--------|-------|
| Company / Shift / Notifications / Backup / Preferences placeholders | KEEP | Preferences must not open electricity |
| User / PIN / Permissions | KEEP under Settings | |
| Approvals | KEEP under Security | KEEP SEPARATE from Settings admin |
| Dual approval tables | KEEP SEPARATE until CEO cleanup | `approval_queue` + `pending_approvals` — no DROP |
| `settings-hub` dead screen id | REMOVE-LATER | Dead type only |

### 3.13 Cash Book

| Existing Page / Function | Action |
|--------------------------|--------|
| Cash Book | **KEEP** |

### 3.14 Loan Tracker

| Existing Page / Function | Action |
|--------------------------|--------|
| Loan Tracker (under Reports) | **KEEP** |

---

## 4. CALCULATION / ENGINE OVERLAP

| Calculation | Used by | Decision |
|-------------|---------|----------|
| Design-wise warp/weft ÷9,000,000 + PIC + MU + GST | Design-wise Costing page | KEEP |
| Same weft weight formula for issue KG | Weft Yarn Issue | KEEP SEPARATE purpose (not costing UI) |
| Daily salary × present + yarn proxy + GEB/elec + maint vs challan billing | Daily Factory Costing | KEEP SEPARATE |
| Payroll run (HR) | HR & Payroll | KEEP (canonical payroll math) |
| Admin legacy rate × days | Admin payroll tab | LEGACY |
| Program meters / checking / dispatch totals | Program & Dispatch | KEEP |

---

## 5. DATABASE TABLE DECISIONS (NO DROPS NOW)

| Domain | Canonical tables | Legacy / parallel (KEEP data; REMOVE-LATER UI only) |
|--------|------------------|-----------------------------------------------------|
| DESI | `dins`, `din_matchings`, `din_sample_cards`, `din_followups` | — |
| Design-wise costing | `design_costing*` | `design_warp`/`design_weft` historical OK |
| Samples | Prefer DESI sample path | `sample_job_cards*` archive |
| Customer orders | `order_book*` | — |
| Internal pending | `orders` | KEEP SEPARATE |
| Programs / production | `programs`, `program_petty`, `production_entries`, `job_cards*` | — |
| Dispatch | `checking_lots`, `lot_damages`, `challans`, `gatepass`, `gst_invoices`, `folding_entries` | Classic DispatchScreen UI |
| Warp | `warp_pipes`, `warp_yarn_transactions`, `warp_yarn_purchases`, `warp_warper_jobs` | `warp_beam_pipe`, `beam_pipe_stock`, `beam_pipe_out/in` |
| Weft / yarn stock | `weft_yarn_stock`, `yarn_stock_ledger`, `machine_weft_issues*` | multi entry UIs legacy |
| Security | `security_inventory_*`, `inventory_item_*` | — |
| Maint GP | `gate_pass`, `maintenance_material` | `repairing_tracker` |
| Electricity | `geb_readings` preferred for daily costing | `electricity_entries` history KEEP |
| Payroll | `salary_rates`, `payroll_runs`, `payroll_entries`, … | `payroll_rates` |
| Approvals | both queues until unify | no DROP |
| Cash | `cashbook_*` | — |

**Global table policy:** **KEEP SEPARATE / LEGACY data · REMOVE-LATER UI · NEVER DROP without new CEO sign-off.**

---

## 6. WORKFLOW VERIFICATION SUMMARY

| Workflow | Status | Decision |
|----------|--------|----------|
| DESI → Design-wise Costing → Sample → Order → Program → Machine → Production → Folding → Dispatch → Invoice/GP | Exists | **KEEP** intact |
| Warp Yarn full lifecycle | Exists in WYM | **KEEP** |
| Weft: DESI/Program → Matching-wise requirement → KG → Issue → Machine → Production → Balance | Exists in MWP | **KEEP** |
| Security gate inward/outward + reports | Exists | **KEEP** |
| Attendance → Payroll → Bank letter | Exists in HR | **KEEP** |
| Machine-wise Maintenance M1–M6 | Exists | **KEEP**; repair deeper unify remaining |
| Daily Factory Costing / Daily P&L | Exists | **KEEP SEPARATE** from Design-wise |
| Cash Book | Exists | **KEEP** |
| Reports hub | Exists | **KEEP** (no duplicate entry) |

---

## 7. LEGACY LIST (SAFE TO HIDE LATER — NOT DELETE DATA)

| Legacy item | After |
|-------------|--------|
| Program Card classic | Parity in PD PTO verified |
| Classic DispatchScreen | PD covers all historical docs |
| Classic Production Entry | MWP entry only used |
| Warp Beam Pipe / beam stock UI | WYM counts reconciled |
| Purchase Entry as live gate | Security posting proven |
| Repair Tracker classic | Canonical repair handles open tickets |
| Admin Payroll Rates UI | Rates in Salary Rate Master |
| Standalone Sample Job Card page | All cards visible under DESI/Archive |
| `electricity_entries` entry UI | GEB sole entry (history retained) |

---

## 8. REMOVE-LATER (ONLY AFTER DEPENDENCY VERIFICATION)

1. Legacy **page files** (DispatchScreen, WarpBeamPipeScreen, unused PdEntry-only path, etc.) — after zero navigation + smoke  
2. Dead `settings-hub` type  
3. Duplicate menu IDs if any remain  
4. **Never** DROP tables in the same step as UI hide  

---

## 9. REMAINING OPEN WORK (NOT PART OF THIS AUDIT ACTION)

These are noted for future implementation phases — **this report does not authorize them**:

| Item | Note |
|------|------|
| Deeper Repair Out/In single form | Nav/canonical path decided; full field merge still open |
| Map `payroll_rates` → `salary_rates` fully | Daily Costing may still read payroll_rates |
| Real Greige Stock page | Menu was misleading; build later if needed |
| Unify approval queues | UI may show both; tables stay |
| Hide LEGACY menus from floor roles | After training |

---

## 10. EXECUTIVE COUNTS (DECISION STATE)

| Metric | Count |
|--------|------:|
| Top-level modules KEEP | **14** |
| Core workflows KEEP | **8+** |
| Explicit KEEP SEPARATE pairs | **Daily vs Design-wise Costing**; **Inventory vs Security modules**; **Broadcast vs Promotion**; **Party vs CRM**; **Internal Pending vs Customer Order DBs**; **Sales gatepass vs Maint gate_pass**; **Design-wise Costing vs Matching-wise Weft Requirement** |
| MERGE targets (canonical) | Production Entry · Job Card home · Security gate entry · Item Master · DESI Sample issuer |
| LEGACY surfaces | **~10–12** |
| REMOVE-LATER (UI/files only) | **~8–10** candidates |
| Table DROPs authorized by this report | **0** |

---

## 11. FINAL VERDICT ON DAILY COSTING

> **Daily Factory Costing / Daily P&L must remain completely separate from Design-wise Costing.**  
> Do not merge screens, formulas, reports, or menus into one “Costing” product.  
> Design-wise Costing serves DESI / design ₹/meter.  
> Daily Factory Costing serves day-level factory P&L.  
> Matching-wise Weft Yarn Requirement is a production/issue calculation, not a costing module.

---

## 12. STOP

This document completes the **duplicate/overlap audit** and records the **final KEEP / MERGE / KEEP SEPARATE / LEGACY / REMOVE-LATER** decisions.

**Performed in this step:**
- Report created only  

**Not performed:**
- No code changes  
- No database changes  
- No sidebar changes  
- No deployment  
- No merges/deletes/renames of application assets  

---

*End of JAISAL_FW_FINAL_DECISION_REPORT.md*
