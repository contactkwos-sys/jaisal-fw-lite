# JAISAL FW — CEO DECISION SHEET

**Date:** 21 August 2026  
**Status:** DECISION DOCUMENT ONLY — DO NOT IMPLEMENT  
**Sources:** `JAISAL_FW_AUDIT_REPORT.md` · `JAISAL_FW_FINAL_COMPACTION_PLAN.md`  

---

## How to use this sheet

For each decision below, tick **one**:

- **APPROVE** — accept the Recommended option as written  
- **MODIFY** — accept direction but change details (write note)  
- **KEEP SEPARATE** — do not consolidate; leave current split  
- **DO NOT CHANGE** — leave this area untouched in compaction  

**Global locks (already agreed — not for re-debate unless you override):**

- Never delete business data  
- Never drop database tables without explicit CEO approval  
- No route / sidebar / DB field rename / deploy in this phase  
- No implementation until this sheet is answered  

---

# DECISION 1 — Internal Orders & Pending naming

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-01** |
| **2. Current situation** | Two different “order” ideas exist. (A) Customer fabric/design orders use `order_book` / `order_book_items`. (B) A separate simple pending list uses table `orders` (purchase/repair/factory checklist). Both feel like “orders” to users. |
| **3. Existing pages involved** | Orders & Pending → `orders-pending`; Order Book → `orders`; Design to Order → Customer Order / Order Booking → `dto-order-booking`; Order Status → `dto-order-status` |
| **4. Proposed final solution** | Keep databases **separate**. Rename only the **B** module/page label so it is clearly **not** a customer fabric order. Suggested names: **“Internal Pending”**, **“Store / Repair Pending”**, or **“Factory Pending List”**. Customer fabric order stays under Design to Order as **Customer Order**. |
| **5. Preserved** | All rows in `orders` and all rows in `order_book*`; both workflows remain usable |
| **6. Becomes legacy** | Confusing label “Orders & Pending” for the internal list |
| **7. Merged** | Nothing merged at database level |
| **8. Removed later (if approved)** | Old label only — not the page or table |
| **9. Risk if merged** | **High if databases were merged** — fabric orders and internal pending would corrupt each other. Rename-only is low risk. |
| **10. Recommended option** | Rename internal module to **“Internal Pending”** (or your preferred label). Keep `orders` table separate forever unless you later approve a redesign. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**CEO chosen name (if APPROVE/MODIFY):** _______________________________

---

# DECISION 2 — Real Item Master

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-02** |
| **2. Current situation** | Masters → “Item Master” currently opens **Design Catalog** (design/matching photos). That is wrong. Real item/stock masters exist partly as `inventory_item_master` / yarn stock / consumables, but there is no correct Item Master page. |
| **3. Existing pages involved** | Masters → Item Master (mislinked); Design Catalog; Inventory Yarn Stock; Security General (item dropdown); `inventory_item_master` / `inventory_item_stock` |
| **4. Proposed final solution** | Build a true **Item Master** on inventory item tables (or explicitly define Item Master = yarn + consumable masters only). Design Catalog stays Design Catalog — never called Item Master. |
| **5. Preserved** | Design Catalog data; existing inventory item rows; yarn stock |
| **6. Becomes legacy** | Misleading “Item Master → Design Catalog” link |
| **7. Merged** | N/A until Item Master UI exists; then Security/Inventory pick from same master |
| **8. Removed later** | Mislabel only |
| **9. Risk if merged** | Building wrong master could confuse Design DNA with store SKUs |
| **10. Recommended option** | **BUILD** Item Master on `inventory_item_master` (+ stock). Keep Design Catalog separate. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**CEO note (scope of Item Master):** _______________________________

---

# DECISION 3 — Final location of Production Entry

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-03** |
| **2. Current situation** | Three Production Entry UIs write (or can write) `production_entries`: (1) Machine-wise Production → Entry, (2) Program & Dispatch → Entry, (3) Legacy Production → Machine Entry. |
| **3. Existing pages involved** | `machine-wise-production` / `entry`; `program-dispatch` / `entry` (PdEntry); `production` / `entry` |
| **4. Proposed final solution** | **One canonical Production Entry** inside **Machine-wise Production**. Program & Dispatch either **redirects** to it or **embeds** the same component (same fields, same table). Legacy entry becomes LEGACY then hidden after parity. |
| **5. Preserved** | All `production_entries` rows; all useful fields from all three forms (unioned into one form) |
| **6. Becomes legacy** | PD Entry as separate form; Legacy Production Entry |
| **7. Merged** | Three UIs → one component/page |
| **8. Removed later** | Duplicate Entry screens/menus after migration checklist |
| **9. Risk if merged** | Operators who only open Program & Dispatch may get lost if only a hard redirect is used without embed |
| **10. Recommended option** | Canonical = **MWP Production Entry**; **embed same component inside PD** so both modules open one engine (best UX). |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**CEO pick:** [ ] Redirect only [ ] Embed in PD [ ] Other: ___________

---

# DECISION 4 — Final location of Job Card

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-04** |
| **2. Current situation** | Legacy Job Card Issue (`production` / `job`) sits beside Program & Dispatch workflow. Compaction plan also wants **Machine-wise Job Card Issue** under Machine-wise Production (with weft/print/WhatsApp). Same business document family: `job_cards` / `job_card_colours`. |
| **3. Existing pages involved** | Program & Dispatch → Job Card (Legacy); Production → Job Card; planned MWP Job Card; programs linked via `program_id` |
| **4. Proposed final solution** | **Primary home = Machine-wise Production → Job Card Issue** (linked to program/DESI/matching). Program & Dispatch workflow still shows Job Card as a **step** that opens the same canonical screen/data. Legacy Job Card marked LEGACY until parity. |
| **5. Preserved** | All job cards, colours, print layouts, program links |
| **6. Becomes legacy** | Standalone classic Job Card UI |
| **7. Merged** | Legacy Job Card fields/capabilities into MWP Job Card |
| **8. Removed later** | Legacy Job Card menu/page after parity + print verification |
| **9. Risk if merged** | Missing fields (fut/panel, multi-colour) if MWP Job Card is thinner than legacy |
| **10. Recommended option** | **MWP = primary**; PD keeps a workflow step that opens the **same** Job Card (not a second issuer). |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 5 — Purchase entry screens vs Security gate entry

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-05** |
| **2. Current situation** | Same inward types can be entered from Purchase (Weft / Maint In / General) and from Security Inventory (Weft / Maint In / General) and sometimes Yarn OCR / Warp Yarn. Duplicate data-entry paths. |
| **3. Existing pages involved** | PurchaseScreen subs; Security Inventory warp/weft/maint-in/general/others; Yarn Inward OCR; Inventory menus pointing at Purchase |
| **4. Proposed final solution** | **Security = physical gate entry (canonical).** Security save **auto-updates Inventory/stock**. Purchase screens become **accounting/history/report** views, or soft-legacy entry until Security posting is proven. |
| **5. Preserved** | All historical purchase rows, SI rows, stock ledgers; gate photos/docs |
| **6. Becomes legacy** | Purchase as a second live entry door (after cutover) |
| **7. Merged** | Entry path only (not deleting purchase tables) |
| **8. Removed later** | Purchase **entry** menus — only if CEO approves after trial period; tables stay |
| **9. Risk if merged** | Accounts staff habit; missing GST/rate fields if Security form is incomplete |
| **10. Recommended option** | Canonical entry = **Security**. Keep Purchase as **read/report** for 60 days, then CEO decides hide vs keep forever as soft-legacy. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**After Security proven:** [ ] Hide Purchase entry [ ] Keep Purchase entry forever as soft-legacy [ ] Other: ___

---

# DECISION 6 — Approvals location

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-06** |
| **2. Current situation** | Approvals live under Security → Admin Approvals. Inventory “Stock Adjustment” wrongly opens Approvals. Two technical queues exist: `approval_queue` and `pending_approvals`. |
| **3. Existing pages involved** | Admin Approvals; Inventory Stock Adjustment (mislink); Security menu |
| **4. Proposed final solution** | Pick **one menu home**: **Security → Approvals** (gate/CEO edit queue) **or** **Settings → Approvals**. Fix Stock Adjustment to a real adjust flow or remove mislabel. Later (separate decision) unify the two queues. |
| **5. Preserved** | All pending/approved request rows |
| **6. Becomes legacy** | Duplicate/mislabelled Stock Adjustment → Approvals |
| **7. Merged** | Menu home only in this decision (queue unify = D-16) |
| **8. Removed later** | Mislink; optionally one queue UI after unify |
| **9. Risk if merged** | Wrong role access if moved to Settings and Security cannot open it |
| **10. Recommended option** | Keep Approvals under **Security** (CEO + gate corrections). Move only User/PIN/Permissions to Settings. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**Home:** [ ] Security [ ] Settings [ ] Both (not recommended)

---

# DECISION 7 — GEB / Electricity location

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-07** |
| **2. Current situation** | GEB Readings (`geb_readings`) exist under Security and Reports. Daily Costing still uses older `electricity_entries`. Settings “System Preferences” wrongly opens electricity. |
| **3. Existing pages involved** | `geb-readings`; Costing → Electricity; Settings Preferences (mislink); Security GEB; Reports GEB |
| **4. Proposed final solution** | **One meter entry = GEB Readings.** Daily Factory Costing **reads GEB**. Fix Settings Preferences (no electricity). Decide menu homes: Security entry allowed? Reports deep link only? |
| **5. Preserved** | All GEB rows; migrate/read historical `electricity_entries` without delete |
| **6. Becomes legacy** | `electricity_entries` entry UI; Preferences mislink |
| **7. Merged** | Electricity entry → GEB; costing consumes GEB |
| **8. Removed later** | Electricity entry UI only after CEO OK; **tables not dropped** without D-09 |
| **9. Risk if merged** | Daily Costing numbers change if GEB series ≠ old electricity series |
| **10. Recommended option** | Entry: **Security + Reports deep link**. Costing reads GEB. Reconcile old electricity history as read-only. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**GEB entry menus:** [ ] Security + Reports [ ] Reports only [ ] Security only

---

# DECISION 8 — Sample Register vs DESI Sample Tracking

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-08** |
| **2. Current situation** | DESI Sample Tracking (`dto-tracking`) manages produce/receive/approve on DESI matchings. Sample Register lists standalone `sample_job_cards` history. Overlap for users. |
| **3. Existing pages involved** | `dto-tracking`; `sample-register`; also related D-17 Sample Job Card dual issuer |
| **4. Proposed final solution** | Option A: Merge Sample Register history into Sample Tracking (archive tab). Option B: Keep Sample Register as **archive/report only** under Orders/Reports. |
| **5. Preserved** | All sample card and matching history |
| **6. Becomes legacy** | Sample Register as a second live tracking UI (if merged) |
| **7. Merged** | Register view into Tracking archive **or** keep as report |
| **8. Removed later** | Live duplicate tracking menu only if merged |
| **9. Risk if merged** | Older non-DESI sample cards harder to find if Tracking is DESI-only |
| **10. Recommended option** | Keep Sample Register as **Archive / Report**; Sample Tracking = live DESI workflow. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 9 — Legacy table retirement

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-09** |
| **2. Current situation** | Compaction will archive UIs first. Old tables remain (`warp_beam_pipe`, `beam_pipe_stock`, `electricity_entries`, `payroll_rates`, `approval_queue`, `repairing_tracker`, etc.). Plan forbids DROP without CEO approval. |
| **3. Existing pages involved** | All legacy screens listed in compaction plan §§8–9 |
| **4. Proposed final solution** | Phase policy: **Never drop tables in 2026** unless CEO explicitly approves a later cleanup after N months freeze + backup. UI hide ≠ table drop. |
| **5. Preserved** | All historical data indefinitely under this option |
| **6. Becomes legacy** | Tables become read-only / unused by UI |
| **7. Merged** | Data may be copied forward into canonical tables; originals stay |
| **8. Removed later** | Tables only if you later tick a separate DROP approval |
| **9. Risk if merged/dropped early** | **Critical** — irreversible history loss, broken reports |
| **10. Recommended option** | **Do not drop any tables in compaction.** Revisit earliest after **6 months** freeze with backup + written CEO approval per table. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**Earliest cleanup review date (if any):** _______________

---

# DECISION 10 — DESI terminology transition

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-10** |
| **2. Current situation** | UI says DIN / DIN Intake / DIN Costing. Business wants **DESI** and **Design-wise Costing**. DB fields stay `din_*` for now. |
| **3. Existing pages involved** | All Design to Order screens; Design-wise Costing; permissions labels; print/WhatsApp text that say DIN |
| **4. Proposed final solution** | Phase 1 UI rename only. Optional transition label: **“DESI (formerly DIN)”** for a period. Never rename DB columns in this phase. Never use “Matching-wise Costing”. |
| **5. Preserved** | All DESI/DIN records; costing engine; `din_number` values |
| **6. Becomes legacy** | User-facing word “DIN” |
| **7. Merged** | N/A (label change) |
| **8. Removed later** | Transition subtitle after staff trained |
| **9. Risk if merged/renamed poorly** | Floor confusion; search still uses old mental model |
| **10. Recommended option** | Rename to DESI / Design-wise Costing **with** “formerly DIN” subtitle for **30–60 days**. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**Show “formerly DIN”?** [ ] Yes [ ] No Duration: ________

---

# DECISION 11 — Security vs Inventory boundary

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-11** |
| **2. Current situation** | Inventory and Security both expose inward-like menus. Plan rule: Security = physical gate; Inventory = stock/accounting. Not a full merge of modules. |
| **3. Existing pages involved** | Inventory hub; Security Inventory; Purchase; Yarn OCR; Warp Yarn (stock effects) |
| **4. Proposed final solution** | Keep **two modules**. Security owns gate entry. Inventory owns stock balances, ledgers, stock reports, adjustments (real). Security posts automatically into Inventory/Warp/Weft tables. |
| **5. Preserved** | Both modules; all stock and gate history |
| **6. Becomes legacy** | Inventory menus that are actually gate entry duplicates |
| **7. Merged** | Entry paths only — not the modules themselves |
| **8. Removed later** | Duplicate Inventory inward entry links |
| **9. Risk if merged completely** | Mixing gate duty with accounting; role permissions break |
| **10. Recommended option** | **APPROVE boundary as stated** — do **not** merge Inventory + Security into one top module. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 12 — Maintenance Repair Out/In canonical workflow

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-12** |
| **2. Current situation** | Three overlapping repair/material flows: (1) Machine-wise Maintenance / Legacy Repair, (2) Security → Repair Out/In, (3) Maintenance Material Out/In with auto `gate_pass`. Sales dispatch uses different table `gatepass`. |
| **3. Existing pages involved** | `MachineWiseMaintenanceScreen`; `MaintenanceScreen` repair; `SecurityInventoryScreen` maint-out; `MaintenanceMaterialScreen`; tables `repairing_tracker`, `maintenance_material`, `gate_pass`, SI entries, breakdowns |
| **4. Proposed final solution** | One **canonical repair workflow**: CMMS breakdown/complaint on machine → if material/part leaves factory, create **Repair Out** (Security gate + `gate_pass`) → Repair In closes gate → parts/payment/history on machine. Material-only moves use same gate+material engine. **Do not merge** maint `gate_pass` with sales `gatepass`. |
| **5. Preserved** | All repair tickets, material rows, gate passes, machine history, payments/costs |
| **6. Becomes legacy** | Separate Legacy Repair screen; duplicate SI-only or Material-only UIs after unification |
| **7. Merged** | Three UIs → one workflow (multi-step, shared data) |
| **8. Removed later** | Legacy repair page/menus after open tickets cleared |
| **9. Risk if merged** | **High** — field loss, open OUT without IN, broken auto GP |
| **10. Recommended option** | Approve canonical workflow above; implement with **dual-write period**; no table drops. |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# ADDITIONAL DECISIONS (must answer before compaction)

---

# DECISION 13 — Design Broadcast vs Customer Promotion

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-13** |
| **2. Current situation** | Design Broadcast shares new design + colour chart. DESI Customer Promotion shares **approved matching** to parties. Similar “share” feeling, different business stage. |
| **3. Existing pages involved** | `broadcast`; `dto-promotion`; Design Catalog share |
| **4. Proposed final solution** | Keep both: Broadcast = marketing/new design; Promotion = post-approval DESI matching. Catalog share stays catalog. |
| **5. Preserved** | All three share histories |
| **6–8. Legacy / merge / remove** | None if kept separate |
| **9. Risk if merged** | Mixing unapproved designs with approved matchings |
| **10. Recommended option** | **KEEP SEPARATE** (both live) |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 14 — Customer Order vs Order Book entry UI

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-14** |
| **2. Current situation** | DESI Customer Order and classic Order Book both write `order_book*`. |
| **3. Existing pages involved** | `dto-order-booking`; `orders` / entry; Party Delivery Report |
| **4. Proposed final solution** | Canonical **entry** = DESI Customer Order. Order Book kept for **party delivery report + adjustments** (and view). |
| **5. Preserved** | All order_book data; adjust notes; reports |
| **6. Becomes legacy** | Classic “New Order” as primary entry |
| **7. Merged** | Entry fields into Customer Order |
| **8. Removed later** | Duplicate New Order menu if unused |
| **9. Risk if merged** | Non-DESI rush orders harder if Customer Order requires DESI |
| **10. Recommended option** | DESI Customer Order = primary; allow Order Book **quick entry** only if CEO needs non-DESI orders (**MODIFY** if yes). |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

**Allow non-DESI order entry in Order Book?** [ ] Yes [ ] No

---

# DECISION 15 — Standalone Sample Job Card page

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-15** |
| **2. Current situation** | DTO Sample Job Card + standalone Sample Job Card (only reachable from DTO button). Two issuers / table families. |
| **3. Existing pages involved** | `dto-sample-job`; `sample-job-card`; tables `din_sample_cards` vs `sample_job_cards*` |
| **4. Proposed final solution** | Canonical = DESI Sample Job Card. Migrate/link standalone cards; then legacy/hide standalone page. |
| **5. Preserved** | All sample cards and colours |
| **6. Becomes legacy** | Standalone Sample Job Card page |
| **7. Merged** | Standalone → DESI sample (map/link) |
| **8. Removed later** | Standalone page after verification |
| **9. Risk if merged** | Medium — mapping DESI id / matching numbers |
| **10. Recommended option** | MERGE into DESI Sample Job Card; no table drop |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 16 — Dual approval queues (`approval_queue` vs `pending_approvals`)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-16** |
| **2. Current situation** | Two technical approval systems. Admin UI shows legacy + newer pending. |
| **3. Existing pages involved** | Admin Approvals; mutate helpers; Inventory mislink |
| **4. Proposed final solution** | Short term: one UI that shows both. Long term: single queue (CEO timing). No table drop without D-09. |
| **5. Preserved** | All requests in both tables |
| **6. Becomes legacy** | Older queue UI wording |
| **7. Merged** | Display/workflow first; data later if approved |
| **8. Removed later** | One queue table only with explicit CEO OK |
| **9. Risk if merged** | Lost pending edits if mapping wrong |
| **10. Recommended option** | Unify **UI now**; **do not drop** either table in 2026 |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 17 — User / PIN / Permissions home (Settings vs Security)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-17** |
| **2. Current situation** | User/PIN and Permissions sit under Security menu with gate tools. |
| **3. Existing pages involved** | Admin roles/permissions; Security sidebar |
| **4. Proposed final solution** | Move **User/PIN** and **Permissions** to **Settings**. Keep Approvals per D-06. |
| **5. Preserved** | All users, roles, permission overrides |
| **6. Becomes legacy** | Security as home for PIN admin |
| **7. Merged** | Menu move only |
| **8. Removed later** | Duplicate Security admin links |
| **9. Risk if merged** | Security role may lose access unless permissions updated |
| **10. Recommended option** | Move to **Settings**; grant Security role only what it needs for gate |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 18 — Top module rename / order (Production → Machine-wise Production)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-18** |
| **2. Current situation** | Sidebar module is labeled **Production** but mixes Warp Issue, Folding, Dispatch deep links. Final plan wants module **Machine-wise Production** and Folding/Dispatch owned by Program & Dispatch. |
| **3. Existing pages involved** | Entire `production` hub in `nav.ts`; PD; Warp Yarn |
| **4. Proposed final solution** | Rename/reorder top modules to the approved 14-structure; strip cross-module clutter from Machine-wise Production hub. |
| **5. Preserved** | All screens remain reachable via correct module |
| **6. Becomes legacy** | “Production” umbrella label |
| **7. Merged** | Navigation IA only |
| **8. Removed later** | Misleading hub cards |
| **9. Risk if merged** | Users look for Folding under old Production habit |
| **10. Recommended option** | APPROVE rename + reorder; short training note |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 19 — Mobile bottom navigation (which 4 modules)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-19** |
| **2. Current situation** | Mobile bottom nav shows first 4 `mobileNav` modules (today: Dashboard, Production, Inventory, Design to Order). After reorder, first four change unless you pick explicitly. |
| **3. Existing pages involved** | AppShell bottom nav; MAIN_MODULES flags |
| **4. Proposed final solution** | Explicitly choose 4 mobile modules after final order. |
| **5. Preserved** | Full sidebar still has all 14 |
| **6–8.** | N/A |
| **9. Risk** | Wrong 4 slows daily floor work |
| **10. Recommended option** | Dashboard · Design to Order · Machine-wise Production · Program & Dispatch *(or Security if gate-heavy)* |

**11. CEO decision**

- [ ] APPROVE recommended 4  
- [ ] MODIFY list: 1)____ 2)____ 3)____ 4)____  
- [ ] KEEP SEPARATE (keep today’s 4)  
- [ ] DO NOT CHANGE  

---

# DECISION 20 — Orphan DispatchScreen & other unreachable pages

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-20** |
| **2. Current situation** | Classic `DispatchScreen` is in code but not in sidebar. Standalone Sample Job Card only via button. SI Documents missing from sidebar. |
| **3. Existing pages involved** | `dispatch`; `sample-job-card`; SI documents sub |
| **4. Proposed final solution** | Do not leave silent orphans: mark LEGACY and merge into PD / DESI Sample; add Documents to Security sidebar if kept. |
| **5. Preserved** | Any historical challan/folding/GP created via classic screen |
| **6. Becomes legacy** | DispatchScreen |
| **7. Merged** | Into Program & Dispatch |
| **8. Removed later** | File/route after PD parity proven |
| **9. Risk** | Rare historical path missed in PD |
| **10. Recommended option** | LEGACY → MERGE into PD; remove UI later only with checklist |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 21 — Greige Stock (currently false link)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-21** |
| **2. Current situation** | Inventory → Greige Stock opens Production report — not greige stock. |
| **3. Existing pages involved** | Inventory greige menu; production report; folding/checking meters |
| **4. Proposed final solution** | Either BUILD a real Greige Stock view from folding/checking/production balances, or rename/remove the misleading menu until built. |
| **5. Preserved** | Underlying production/folding data |
| **6. Becomes legacy** | False greige link |
| **7. Merged** | N/A |
| **8. Removed later** | Misleading label |
| **9. Risk** | Users think greige exists when it does not |
| **10. Recommended option** | Hide/rename until real Greige Stock is built; then place under Inventory |

**11. CEO decision**

- [ ] APPROVE (hide until built)  
- [ ] MODIFY — build Greige Stock now as part of compaction  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 22 — Daily Factory Costing vs Design-wise Costing (naming & separation)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-22** |
| **2. Current situation** | Reports “Costing Report” is Daily P&L (`CostingScreen`). “DIN Costing” is Design-wise Costing. Easy to confuse. |
| **3. Existing pages involved** | `costing`; `design-wise-costing`; Reports hub |
| **4. Proposed final solution** | Keep **both systems**. Rename daily one to **Daily Factory Costing**. Design-wise Costing stays the DESI costing engine. |
| **5. Preserved** | Both engines and histories |
| **6–8.** | Label cleanup only |
| **9. Risk** | Low if renamed; high if someone merges them |
| **10. Recommended option** | KEEP SEPARATE + rename Daily Factory Costing |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY _______________________________  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 23 — Legacy Program Card / Warp Beam Pipe / Admin Payroll (batch legacy policy)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-23** |
| **2. Current situation** | Several screens already labeled Legacy: Program Card, Warp Beam Pipe, Admin Payroll rates, Stock Beam. |
| **3. Existing pages involved** | `programs`; `warp-beam-pipe`; Admin payroll; Stock beam tab |
| **4. Proposed final solution** | Confirm they follow standard path: LEGACY visible → migrate/parity → hide menu → file remove only later (tables stay per D-09). |
| **5. Preserved** | All program/beam/rate history |
| **6. Becomes legacy** | Those UIs (already) |
| **7. Merged** | Into PD / WYM / HR Rate Master |
| **8. Removed later** | UI only after CEO OK |
| **9. Risk** | Medium per domain |
| **10. Recommended option** | APPROVE standard legacy policy for all of them |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY (exclude: _______________)  
- [ ] KEEP SEPARATE  
- [ ] DO NOT CHANGE  

---

# DECISION 24 — Yarn Inward OCR home (one menu)

| Field | Detail |
|-------|--------|
| **1. Decision No.** | **D-24** |
| **2. Current situation** | Yarn Inward OCR appears under Inventory and Security (same screen). |
| **3. Existing pages involved** | `yarn-inward`; both sidebars |
| **4. Proposed final solution** | One menu home. Recommended: Security (gate assist), with optional Inventory deep link removed. |
| **5. Preserved** | All `yarn_inward` rows; OCR flow |
| **6. Becomes legacy** | Duplicate menu entry |
| **7. Merged** | Menus only |
| **8. Removed later** | Extra sidebar item |
| **9. Risk** | Low |
| **10. Recommended option** | Single home under **Security** |

**11. CEO decision**

- [ ] APPROVE  
- [ ] MODIFY — home under Inventory instead  
- [ ] KEEP SEPARATE (both menus)  
- [ ] DO NOT CHANGE  

---

# CEO APPROVAL SUMMARY

Numbered list of every decision that needs your answer:

| No. | ID | Topic | Recommended |
|-----|-----|-------|-------------|
| 1 | D-01 | Internal Orders & Pending naming | Rename to “Internal Pending” (or your name); keep DB separate |
| 2 | D-02 | Real Item Master | Build on `inventory_item_master`; Catalog stays Catalog |
| 3 | D-03 | Production Entry location | One engine in MWP; **embed** in Program & Dispatch |
| 4 | D-04 | Job Card location | Primary in MWP; PD opens same Job Card |
| 5 | D-05 | Purchase vs Security entry | Security = gate entry; Purchase → report/soft-legacy |
| 6 | D-06 | Approvals location | Stay under **Security** |
| 7 | D-07 | GEB / Electricity | GEB = only meter entry; Costing reads GEB; Security + Reports |
| 8 | D-08 | Sample Register vs Tracking | Register = archive/report; Tracking = live DESI |
| 9 | D-09 | Legacy table retirement | **No table drops** in compaction; review after 6+ months |
| 10 | D-10 | DESI terminology | UI DESI + Design-wise Costing; optional “formerly DIN” |
| 11 | D-11 | Security vs Inventory boundary | Keep both modules; Security posts to Inventory |
| 12 | D-12 | Maintenance Repair Out/In | One canonical repair + gate_pass; dual-write first |
| 13 | D-13 | Broadcast vs Customer Promotion | Keep both separate |
| 14 | D-14 | Customer Order vs Order Book entry | DESI Customer Order primary; report/adjust in Order Book |
| 15 | D-15 | Standalone Sample Job Card | Merge into DESI Sample Job Card |
| 16 | D-16 | Dual approval queues | Unify UI; do not drop tables |
| 17 | D-17 | User/PIN/Permissions home | Move to **Settings** |
| 18 | D-18 | Module rename Production → Machine-wise Production | Approve IA rename/reorder |
| 19 | D-19 | Mobile bottom-nav 4 modules | Dashboard · DTO · MWP · Program & Dispatch |
| 20 | D-20 | Orphan DispatchScreen | LEGACY → merge into Program & Dispatch |
| 21 | D-21 | Greige Stock false link | Hide/rename until real greige built |
| 22 | D-22 | Daily vs Design-wise Costing | Keep separate; rename Daily Factory Costing |
| 23 | D-23 | Batch legacy policy (Program/Beam/Payroll) | Standard LEGACY → hide → later UI remove |
| 24 | D-24 | Yarn Inward OCR single menu | One home under Security |

---

## CEO sign-off block

| | |
|--|--|
| CEO name | _______________________________ |
| Date | _______________________________ |
| Decisions completed | _____ / 24 |
| Permission to start Phase 1 (UI labels / planning only)? | [ ] YES [ ] NO |
| Permission to change sidebar/routes? | [ ] YES [ ] NO (default NO until you say) |
| Permission to migrate data? | [ ] YES [ ] NO (default NO until you say) |
| Permission to delete any UI file? | [ ] YES [ ] NO (default NO) |
| Permission to DROP any database table? | [ ] YES [ ] NO (default **NO**) |

**Notes / overrides:**

________________________________________________________________

________________________________________________________________

________________________________________________________________

---

## STOP

This file is a **decision sheet only**.

- No software was modified  
- No merges, deletes, renames, migrations, or deploys were performed  

Return this sheet with your ticks (or a message listing D-01…D-24 answers) before any compaction implementation begins.

---

*End of JAISAL_FW_CEO_DECISION_SHEET.md*
