# JAISAL FW ERP — Full System Audit Report

**Date:** 27 August 2026  
**Status:** AUDIT COMPLETE · SAFE CLEANUP APPLIED (navigation + permissions)  
**Scope:** Pages, routes, modules, sidebar, database, APIs, roles, duplicates, legacy  

---

## Executive Summary

The ERP has grown in phases. Newer modules (Design/DIN hub, Sales & Order, Production & Dispatch, Warp Yarn, Security Inventory, Machine Maintenance, HR & Payroll) sit beside Phase 1–8 legacy screens. **No database tables were deleted** in this pass. Navigation and role permissions were simplified to reduce confusion.

### Canonical Business Flow (target state)

```
DESIGN INTAKE → DIN COSTING → RATE MASTER → SAMPLE / APPROVAL
       ↓
CUSTOMER ORDER → ORDER STATUS → PROGRAM TO MACHINE → JOB CARD
       ↓
PRODUCTION → CHECKING → DISPATCH → REPORT
```

**Parallel departments (must not mix with customer fabric orders):**
- Inventory (Yarn · Chemical · Maintenance Store)
- Machine Maintenance
- HR & Payroll

---

## A. Duplicate Pages

| Page | Route | Canonical | Duplicate / Legacy | Action |
|------|-------|-----------|-------------------|--------|
| Design Intake | `dto-intake` | **Design Intake** | `design` register | **KEEP** canonical · **ARCHIVE** legacy register |
| DIN Costing | `design-wise-costing` | **DIN Costing** | Reports deep link (removed) | **KEEP** one screen · **MERGE** menu |
| Customer Order | `order-to-program` / `order-entry` | **Customer Order** | `orders`/`entry`, `DtoOrderBookingScreen` | **KEEP** OTP · **ARCHIVE** legacy book |
| Order Status | `order-to-program` / `order-status` | **Order Status** | `DtoOrderStatusScreen`, Orders hub dup | **KEEP** OTP · **REMOVE** menu dup |
| Program to Machine | `order-to-program` / `program` | **Program to Machine** | `programs` (Program Card) | **KEEP** OTP · **LEGACY** program card |
| Program to Production | `program-dispatch` / `pto` | **Program to Production** | Overlaps naming with OTP program step | **KEEP** both — different stage |
| Production Entry | `machine-wise-production` / `entry` | **MWP Production Entry** | PD embedded entry, `production`/`entry` | **KEEP** MWP · **LEGACY** classic entry |
| Checking / Dispatch | `program-dispatch` / folding→invoice | **Production & Dispatch** | `DispatchScreen` | **KEEP** PD · **LEGACY** classic dispatch |
| Sample Job Card | `dto-sample-job` | **Sample Job Card** | `sample-job-card` page | **KEEP** DTO · **LEGACY** standalone |
| Rate Master | `rate-master` | **Rate Master** | Inline rates in costing | **KEEP** one table · auto-pull in costing |
| Order Entry | `order-entry` | **Yarn/Maintenance supply POs** | Confused with Customer Order | **RENAME** labels · **KEEP** separate domain |
| Internal Pending | `orders-pending` | **Internal Pending** | vs Order Status | **KEEP** both — different DB (`orders` vs `order_book`) |
| Daily Costing | `costing` | **Daily Costing & P&L** | vs DIN Costing | **KEEP** both — different purpose |
| Machine Master | `maintenance` / `overview` | **Machine Maintenance** | Masters hub duplicate (removed) | **KEEP** under Maintenance only |
| Warp Yarn | `warp-yarn` | **Warp Yarn Management** | 6 Inventory deep links (removed) | **KEEP** one module · single Inventory link |

### Orphan screens (not in sidebar, still routable)

| File | Status |
|------|--------|
| `DtoOrderBookingScreen.tsx` | **ARCHIVE** — redirected via App.tsx to OrderToProgramScreen |
| `DtoOrderStatusScreen.tsx` | **ARCHIVE** — redirected via App.tsx to OrderToProgramScreen |

---

## B. Duplicate Modules

| Concept | Canonical Module | Was Also In | Action Taken |
|---------|------------------|-------------|--------------|
| Design workflow | **Design** | Orders hub, Reports, Masters | Removed from Orders/Masters sidebar |
| Customer fabric orders | **Sales & Order** | Orders hub (dup entries) | Removed duplicate menu items |
| Production pipeline | **Production & Dispatch** | Machine Production hub | Kept separate — weft issue vs dispatch |
| Maintenance | **Machine Maintenance** | Customer order flow | Confirmed separate — no mixing |
| Inventory | **Inventory** + **Warp Yarn** | 6 duplicate warp links in Inventory | Single "Warp Yarn" link in Inventory |

---

## C. Duplicate Database Tables

| Domain | Canonical Tables | Legacy / Duplicate | Action |
|--------|------------------|-------------------|--------|
| Design costing | `design_costing`, `design_costing_warp/weft`, `dins`, `din_matchings` | `design_warp`, `design_weft` on `designs` | **ARCHIVE** legacy — zero app usage |
| Design identity | `dins` (DIN hub) | `designs`, `design_catalog` | **KEEP** all — different purposes |
| Customer orders | `order_book`, `order_book_items` | — | **KEEP** |
| Internal tasks | `orders` | — | **KEEP** — rename in UI only |
| Supplier POs | `order_entries`, `order_entry_lines` | — | **KEEP** — not customer fabric |
| Programs | `programs`, `program_recipe_feeders` | — | **KEEP** — max 6 feeders enforced |
| Gate pass | `gatepass` (dispatch) | `gate_pass` (maint), `warp_gate_passes` | **KEEP** all — different domains |
| Yarn inward | `yarn_inward`, `warp_yarn_purchases` | `warp_yarn_inward` | **ARCHIVE** legacy read-only |
| Beam/pipe | `warp_pipes`, `warp_yarn_transactions` | `beam_pipe_out/in`, `warp_beam_pipe`, `beam_pipe_stock` | **MERGE** over time · dual-write active |
| Maintenance | `machine_breakdowns` | `maintenance_requests`, `repairing_tracker` | **KEEP** CMMS canonical · **LEGACY** repair tracker |
| Payroll rates | `salary_rates` | `payroll_rates` | **MERGE** — HR uses salary_rates |
| Approvals | `pending_approvals` | `approval_queue` | **KEEP** both — consolidate later |
| Sample cards | `din_sample_cards` + `sample_job_cards` | — | **KEEP** — bridge pattern |

### True orphan tables (no app queries)

| Table | Recommended Action |
|-------|-------------------|
| `beam_pipe_in` | **ARCHIVE** after data review |
| `design_warp` | **ARCHIVE** (superseded by design_costing_warp) |
| `design_weft` | **ARCHIVE** (superseded by design_costing_weft) |
| `order_repair_history` | **ARCHIVE** or wire to Order Entry UI |

---

## D. Duplicate Master Data

**Do NOT delete without consolidation workflow:**

| Entity | Risk | Safe Process |
|--------|------|--------------|
| Employees (`workers`) | Medium | Master record → map duplicates → update FKs → archive |
| Customers (`party_master` vs `crm_customers`) | Low | Intentionally separate (orders vs WhatsApp) |
| Machines M1–M6 | Low | Single source: Maintenance overview |
| Yarn items | Medium | Consolidate via Item Master / yarn stock |
| DIN / designs | High | Always merge via DIN number — never delete costing history |
| Suppliers (`order_suppliers`) | Medium | Dedupe by GSTIN / name |

---

## E. Broken Routes

| Route | Issue | Action |
|-------|-------|--------|
| `placeholder` / dept-master, shift-master | Not built | **KEEP** stub · labeled "Coming Soon" |
| `settings` / preferences | Misleading | **FIX** label · no electricity mis-link |
| `stock` / beam | Legacy warp beam tab | **ARCHIVE** — use Warp Yarn |
| `dto-order-booking`, `dto-order-status` | Orphan screen IDs | **FIX** — redirect to OrderToProgramScreen ✓ |

All primary workflow routes verified routable in `App.tsx`.

---

## F. Broken APIs / Calculation Issues

| Area | Issue | Action |
|------|-------|--------|
| Daily Costing | Falls back to `payroll_rates`, `electricity_entries` | **FIX** — migrate all workers to `salary_rates`; use GEB only |
| Design Costing | Legacy column fallback messages | **FIX** root schema — run pending migrations |
| Salary Up To Date | Loading errors (prior fix branch) | **VERIFY** in HR module |
| Rate Master | Must auto-pull latest effective rate | **KEEP** — verify in `rateMaster.ts` |
| Feeders | Max 7 possible in old data | **FIX** — `MAX_FEEDERS = 6` enforced ✓ |

---

## G. Wrong Department Placement (fixed in nav cleanup)

| Item | Was | Now |
|------|-----|-----|
| Customer Order | Orders hub + Sales & Order | **Sales & Order only** |
| Order Status | Orders hub + Sales & Order | **Sales & Order only** |
| Design Register | Orders + Masters | **Design → LEGACY** |
| Machine Overview | Masters + Maintenance | **Maintenance only** |
| Employee Master | Masters deep link | **HR primary · Masters deep link OK** |
| Warp Yarn 6 tabs | Inventory hub | **Single link → Warp Yarn module** |
| Maintenance orders | Could appear near fabric orders | **Maintenance module only** |

---

## H. Legacy Pages (kept, labeled LEGACY)

| Label | Screen | Purpose |
|-------|--------|---------|
| Program Card (LEGACY) | `programs` | Old program create |
| Classic Dispatch (LEGACY) | `dispatch` | Old folding/challan |
| Classic Production Entry (LEGACY) | `production` / `entry` | Old meter entry |
| Beam Pipe (LEGACY) | `warp-beam-pipe` | Old pipe OUT/IN |
| Purchase Entry (LEGACY) | `purchase` / `general` | Pre-Security inward |
| Repair Tracker (LEGACY) | `maintenance` / `repair` | Old repair log |
| Payroll Rates (LEGACY) | `admin` / `payroll` | Old role rates |
| Order Book (LEGACY) | `orders` / `entry` | Pre-OTP customer orders |
| Design Register (LEGACY) | `design` | Old design list |
| Sample Card (LEGACY) | `sample-job-card` | Old sample issuer |
| Sample Register (Archive) | `sample-register` | Historical log |

---

## I. Calculation Errors

| Module | Known Issue | Status |
|--------|-------------|--------|
| DIN Costing | GST / pic-rate columns | Migrations exist — verify applied |
| HR Payroll | Legacy rate fallback | Warning shown in Daily Costing |
| Order to Program | Recipe totals from matchings | Uses `buildRecipeFeeders` ✓ |
| Matching | Stored in `din_matchings` | Single source per DIN ✓ |

---

## J. UI Problems Addressed

- Removed duplicate sidebar entries for Customer Order / Order Status
- Renamed modules: **Design**, **Sales & Order**, **Production & Dispatch**, **Machine Maintenance**
- Added section headings: DESIGN · SALES & ORDER · PRODUCTION · INVENTORY · MACHINE MAINTENANCE · HR & PAYROLL · ADMIN · SECURITY / SETTINGS
- Legacy items grouped at bottom of each module with `(LEGACY)` suffix
- Clarified **Order Entry** vs **Customer Order** in hints

---

## K. Mobile / iPad

| Check | Status |
|-------|--------|
| Sidebar drawer | ✓ hamburger + drawer |
| Bottom nav (4 modules) | ✓ Dashboard, Design, Sales & Order, Production & Dispatch |
| Touch targets | Industrial theme — verify on device |
| Horizontal scroll on tables | Review per screen — warp-yarn CSS exists |
| Job card print | MWP + PD print styles present |

---

## L. Recommended Final ERP Structure (implemented in sidebar)

```
1. DASHBOARD

2. DESIGN
   - Design Intake
   - DIN Costing
   - Formula Master
   - Rate Master
   - Sample Job Card / Approval
   - Design Reports

3. SALES & ORDER
   - Customer Order
   - Order Status
   - Order Follow-up
   - Program to Machine
   - Order Reports

4. PRODUCTION
   - Production & Dispatch (Program → Checking → Dispatch → Invoice)
   - Machine Production (Weft Issue · Job Card · Entry · Reports)

5. INVENTORY
   - Yarn Stock
   - Warp Yarn (link)
   - Chemical / Consumables
   - Maintenance Store
   - Inventory Reports

6. MACHINE MAINTENANCE
   - Machine Master · PM · Breakdown · Spare Parts · Store · Job Card · Reports

7. HR & PAYROLL
   - Employee → Job → Rate → Attendance → Leave → Advance → Payroll → Payment

8. REPORTS (deep links only)

9. MASTERS

10. SECURITY / SETTINGS
```

---

## Role-Based Navigation (implemented)

| Role | Sees |
|------|------|
| **CEO / MD / Owner** | Full access |
| **Salesman** | Sales & Order (4 items) + Order Reports |
| **Design Team** | Design module (8 items) + Masters |
| **Production** | Machine Production + Production & Dispatch + Program to Machine (no order entry) |
| **Dispatch** | Checking · Dispatch · Challan · Invoice · Gate Pass · Order Status |
| **Maintenance** | Machine Maintenance + Inventory (store items) |
| **HR** | HR & Payroll full flow |
| **Security** | Security Inventory + gate + yarn OCR |
| **Operator** | Production entry + checking only |

---

## Database Audit Summary (130 tables + 1 view)

- **44 migrations** — additive, no drops
- **104 FK constraints** — some polymorphic refs intentionally without FK
- **Hand-maintained types** in `database.types.ts` — consider `supabase gen types`
- **No tables deleted** in this cleanup pass

---

## Safe Cleanup Completed (this PR)

1. ✅ Sidebar restructured — one home per function
2. ✅ Duplicate menu items removed from Orders hub
3. ✅ Inventory warp yarn deep links consolidated
4. ✅ Role-based sub-navigation tightened
5. ✅ Legacy screens labeled and grouped
6. ✅ Orphan screens marked `@deprecated`
7. ✅ Order Follow-up added to Sales & Order sidebar
8. ✅ Module labels simplified

## NOT Done (requires CEO approval + data migration)

- ❌ Database table archival (`design_warp`, `beam_pipe_in`, etc.)
- ❌ Merging OrderBookScreen into OrderToProgramScreen
- ❌ Removing legacy screen files
- ❌ Master data deduplication
- ❌ URL routing (still state-based navigation)
- ❌ DESI terminology rename (DB fields stay `din_*`)

---

## Next Steps (recommended order)

1. **CEO review** this report — approve MERGE/ARCHIVE/REMOVE per row
2. **Apply pending Supabase migrations** on production
3. **Migrate legacy payroll_rates → salary_rates**
4. **Consolidate Order Book UI** into Customer Order (preserve `order_book*` data)
5. **Archive orphan tables** after dependency check
6. **Master data dedup** script with audit trail
7. **Mobile QA** on iPad/iPhone for each role login

---

*Generated by Cloud Agent audit — 27 Aug 2026*
