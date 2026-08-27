# JAISAL FW ERP — Simplification Report

**Date:** 27 August 2026  
**Branch:** `cursor/erp-simplification-4ef7`  
**Mode:** UI / navigation / safety review only  
**Safety:** No production data deleted · no merges · no archives applied · no costing or feeder-limit changes

---

## Goal

Make the existing ERP **simple, fast, clear, and safe** for factory staff and the CEO.

**One function = one screen.** Daily fabric flow is obvious. Parallel modules (HR, Maintenance, Inventory) stay outside that flow.

---

## A. Screens removed / redirected

| Old / duplicate entry | Action | Primary screen |
|----------------------|--------|----------------|
| Order Book → Entry | **Redirect** to Customer Order | Sales & Order → Customer Order (`order-to-program` / `order-entry`) |
| `dto-order-booking` | **Rewired** to same Customer Order screen | `OrderToProgramScreen` |
| `dto-order-status` | **Rewired** to Order Status step | `OrderToProgramScreen` |
| Supply & Historical → “open second order book” | **Not created**; link opens main Customer Order | Same primary |
| Classic / Old screens | Kept routable, labeled **(Old / Historical)** | Prefer modern primary |

No screens were hard-deleted. Historical routes remain for safety.

---

## B. Screens retained (primary)

| Business function | Primary screen |
|-------------------|----------------|
| Customer Order | Sales & Order → Customer Order |
| Order Status | Sales & Order → Order Status |
| Order Follow-up | Sales & Order → Order Follow-up |
| Program to Machine | Sales & Order → Program to Machine |
| DIN Costing | Design → DIN Costing |
| Rate Master | Design → Rate Master |
| Design | Design → DIN Intake / Design Master path |
| Sample | Design → Sample Job / Tracking |
| Production | Production & Dispatch → Production |
| Checking | Production & Dispatch → Checking |
| Dispatch | Production & Dispatch → Dispatch |
| Invoice | Production & Dispatch → Invoice |
| Yarn | Inventory / Warp Yarn / Weft stock |
| Chemical | Inventory / Maintenance store inward |
| Maintenance Store | Inventory / Security Inventory maint paths |
| Machine Maintenance | Machine Maintenance module |
| HR | HR & Payroll |
| Payroll | HR & Payroll → Salary Rate Master (main) |
| Reports | Reports module + per-module report tabs |
| CEO Data Review | Settings → CEO Data Review (approvals only) |

---

## C. Duplicate functions (status)

| Duplicate concept | Decision |
|-------------------|----------|
| Customer Order vs Order Book entry | **One entry** — Order Book entry redirects |
| Party Settlement | Settlement-only under Supply & Historical — **not** order entry |
| Classic Production Entry | Old / Historical — use Production Entry / PD Production |
| Classic Dispatch / Program Card | Old / Historical |
| Design Register / Sample Card | Old / Historical |
| Admin Payroll Rates vs Salary Rate Master | **Not merged** — comparison in CEO Data Review; Salary Rate Master remains main |

---

## D. Yarn duplicate approval list

**Screen:** Settings → CEO Data Review → Yarn Possible Duplicates  

**Rules:** Same supplier + colour + quality + specification only. LICHI vs NSY (and similar quality differences) are **not** treated as duplicates. Decisions save as **review notes only** (device localStorage). **No stock merge runs.**

| Candidate (from Phase 2 verification) | Notes | CEO actions available |
|---------------------------------------|-------|------------------------|
| **5192 HSY FANCY** (paired same-spec rows) | Do not merge only because name looks similar | KEEP SEPARATE · MERGE AS LOTS · MERGE · NOT A DUPLICATE |
| **29 HSY FANCY** (paired same-spec rows) | Same caution | Same |

Special case called out in UI: **5192 / 29** must be reviewed carefully.

---

## E. Payroll duplicate approval list

**Screen:** CEO Data Review → Salary Rate Comparison  

| Source | UI label | Status |
|--------|----------|--------|
| `salary_rates` (HR) | Main (HR) | **Canonical / keep** unless CEO says otherwise |
| `payroll_rates` (Admin) | Old (Admin) | CEO may mark **PROPOSED MERGE** only |

**No merge executed.** Admin Payroll Rates screen remains Old / Historical.

---

## F. Empty archive candidates

| Store | Rows (prod verification) | App `src/` refs | Proposed action | Applied? |
|-------|--------------------------|-----------------|-----------------|----------|
| Design Warp (`design_warp`) | 0 | None | Rename → `design_warp_archive` | **NO** |
| Design Weft (`design_weft`) | 0 | None | Rename → `design_weft_archive` | **NO** |
| Beam Pipe In (`beam_pipe_in`) | 0 | None | Rename → `beam_pipe_in_archive` | **NO** |

**Prepared (not run):** `docs/PROPOSED_archive_empty_tables.sql`  
- RENAME only · NO DROP · row-count guards · audit insert · defaults to `ROLLBACK`  
- CEO must fill WHO / WHEN / WHY before any future `COMMIT`

CEO Data Review → Historical Empty Stores can record **intent only**.

---

## G. Production schema gaps

**Report name:** Production Schema Gap Report (this section)

| Missing on production | Why required | Migration file | Dependencies | Existing alternative | Risk | Recommended window |
|-----------------------|--------------|----------------|--------------|----------------------|------|--------------------|
| `order_suppliers` | Yarn PO / order-entry supplier master | `supabase/migrations/20260822140000_order_entry_module.sql` | Referenced by order weft colours / warp items | Party master / free-text (incomplete) | Medium — yarn supply entry may error until applied | Separate approved change · low-traffic evening · backup first |
| `inventory_item_master` | Security Inventory / Item Master | `supabase/migrations/20260821160000_security_inventory.sql` | Stock + gate item FKs | Manual / incomplete item lists | Medium–High for Security Inventory | Separate approved change · after backup |
| `order_weft_colours` | Order-entry weft colour by supplier | Same order-entry migration | FK → `order_suppliers` | Weft yarn stock colours | Medium | Apply **with** `order_suppliers` in one approved migration |

**Do not apply automatically.** Migration must be a separate CEO-approved change.

---

## H. Role-wise navigation

| Role | Sees (necessary only) |
|------|------------------------|
| **CEO** | Full business visibility + approvals + CEO Data Review + dashboard |
| **Sales** | Customer Order · Order Status · Follow-up · Program to Machine · Order Reports |
| **Design** | Design · DIN Costing · Rate · Sample · Design Reports |
| **Production** | Program · Machine Production · Production Reports |
| **Checking** | Checking · Checking Reports |
| **Dispatch** | Checking · Dispatch · Gate Pass · Invoice · Dispatch Reports (+ order status reports) |
| **Store** | Yarn · Chemical · Maintenance Store · Stock Reports |
| **Maintenance** | Machine · PM · Breakdown · Spare Parts · Maintenance Reports |
| **HR** | Attendance · Employees · Payroll · HR Reports |

Technical / Settings screens remain CEO/Admin.

---

## I. CEO dashboard

**TODAY cards** (each opens the primary screen):

Customer Orders · Pending Orders · Production Today · Checking Pending · Dispatch Today · Outstanding · Yarn Stock · Chemical Stock · Machine Breakdown · Maintenance Due · Attendance · Payroll Status

Also:

- **Daily Factory Flow** strip (see J)
- **Quick Actions** (see §13)
- No table names, UUIDs, migrations, or schema language on the dashboard

---

## J. Daily factory flow (primary navigation)

```
DESIGN
  ↓
DIN COSTING
  ↓
RATE / APPROVAL
  ↓
CUSTOMER ORDER
  ↓
ORDER STATUS
  ↓
PROGRAM TO MACHINE
  ↓
PRODUCTION
  ↓
CHECKING
  ↓
DISPATCH
  ↓
INVOICE
  ↓
REPORT
```

HR · Payroll · Maintenance · Inventory remain **parallel** modules — not mixed into this fabric order path.

---

## K. Mobile / iPad verification

| Check | Status |
|-------|--------|
| Global search in top bar (responsive) | Implemented + CSS for narrow topbar |
| Large touch quick actions / KPI cards | Present on dashboard |
| Factory flow horizontal on desktop; wraps on small screens | CSS `factory-flow-row` |
| Clear Save / Cancel / Back patterns | Existing primary-save / btn-ghost patterns retained |
| No horizontal scroll intent for main forms | Existing OTP / PD forms; smoke suite covers viewports |

**Smoke:** run `npm run smoke:ui` after build (iPhone / iPad / Desktop).

---

## L. Tests

| Test | Purpose |
|------|---------|
| `npm run build` | Typecheck + production bundle |
| `node scripts/module-separation-smoke.mjs` | Design vs Sales separation |
| `npm run smoke:ui` | Nav / responsive UI |
| `npm run smoke:otp` | Order → Program path / feeder limit |

**Business logic unchanged:** `MAX_FEEDERS = 6` · costing formulas untouched · historical `order_book` data preserved.

---

## M. Remaining CEO decisions

1. **Yarn possible duplicates** (5192 HSY FANCY, 29 HSY FANCY, any new pairs) — approve KEEP SEPARATE / MERGE AS LOTS / MERGE / NOT A DUPLICATE  
2. **Old Admin payroll rates** — leave as historical or later approve PROPOSED MERGE into Salary Rate Master  
3. **Empty store archive** — approve rename via `docs/PROPOSED_archive_empty_tables.sql` (or reject)  
4. **Production schema gap migrations** — approve separate apply window for order-entry + inventory item master  
5. **Any future merge / delete / archive** — must show WHAT / HOW MANY / OLD / NEW / WHY / WHO APPROVED

---

## Also delivered this pass

1. **Global search** — Order No · Customer · Design · DIN · Colour · Yarn · Machine · Employee · Challan · Invoice → opens primary screens  
2. **CEO Data Review** — yarn · payroll comparison · empty historical stores (intent only)  
3. **Terminology** — Canonical → Main Record · Legacy → Old / Historical · Archive → Historical Records in user-facing labels  
4. **Quick Actions** on CEO dashboard open existing primary screens only  

---

## Safety confirmation

| Rule | Status |
|------|--------|
| Do not delete production data | Honoured |
| Do not merge masters automatically | Honoured |
| Do not archive automatically | Honoured (SQL proposed + ROLLBACK) |
| Do not change costing formulas | Honoured |
| Do not change production business logic | Honoured |
| Do not alter feeder limit (max 6) | Honoured |
| Do not alter historical order data | Honoured |
