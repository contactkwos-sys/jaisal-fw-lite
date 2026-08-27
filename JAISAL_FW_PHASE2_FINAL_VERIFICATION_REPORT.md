# JAISAL FW ERP — Phase 2 Final CEO Verification Report

**Date:** 27 August 2026  
**Mode:** READ-ONLY — no deletes, no archives, no merges, no irreversible DB operations  
**Production DB:** `https://doitrzsyvcipugmrzykx.supabase.co`  
**PR under review:** #98 (Phase 2 Safe Consolidation)  
**Branch:** `cursor/phase2-safe-consolidation-4ef7`

---

## Executive Verdict

| Area | Verdict |
|------|---------|
| Customer Order single entry point | **VERIFIED SAFE** |
| `order_book` / `order_book_items` intact | **VERIFIED SAFE** (1 header / 2 lines) |
| Max 6 feeders | **VERIFIED SAFE** (code + DB: 0 rows with feeder_no > 6) |
| Salesman 5-item Sales & Order menu | **VERIFIED SAFE** |
| Module separation Design vs Sales | **VERIFIED SAFE** |
| Build + UI smoke (mobile/tablet/desktop) | **VERIFIED SAFE** (26/26) |
| Orphan table archive | **NEEDS CEO APPROVAL** (all empty / safe candidates) |
| Yarn master duplicates | **NEEDS CEO APPROVAL** (2 true groups) |
| Missing production migrations | **NEEDS CEO APPROVAL** (schema gap) |
| payroll_rates / warp_beam_pipe merge | **PROPOSED FUTURE CLEANUP** — do not execute |

**No data was modified during this verification.**

---

## A. VERIFIED SAFE

1. **ONE active Customer Order entry**
   - Canonical: **Sales & Order → Customer Order** (`order-to-program` / `order-entry`)
   - Legacy Order Book **entry** redirects to canonical screen
   - `dto-order-booking` / `dto-order-status` already rewired to `OrderToProgramScreen`
   - Party Settlement (Archive) is settlement-only — not a second order entry

2. **Customer Order flow intact in nav**
   ```
   Customer Order → Order Status → Program to Machine
   Production → Checking → Dispatch → Reports
   ```

3. **Design flow intact**
   ```
   Design Intake → DIN Costing → Formula Master → Rate Master → Sample → Design Reports
   ```

4. **Parallel modules remain separate**
   - Inventory · Machine Maintenance · HR & Payroll — not mixed into fabric order flow

5. **Business rules unchanged**
   - `MAX_FEEDERS = 6` in `orderToProgram.ts`
   - UI blocks adding feeder 7
   - DB integrity: `feedersWithFeederNoGreaterThan6 = 0`
   - Matching recipe loads from Design Master / DIN costing; salesman cannot edit recipe

6. **Salesman role**
   - Modules: `order-to-program`, `reports` (order-related deep links only)
   - OTP subs: Customer Order · Order Status · Order Follow-up · Program to Machine · Order Reports
   - Blocked: Design Master, HR, Payroll, Maintenance, Settings, Dashboard (not in defaults)

7. **Order number unification**
   - Shared `nextCustomerOrderNo()` — existing `ORD-0001` row preserved

8. **Responsive smoke**
   - iPhone (390×844), iPad (1024×768), Desktop (1280×900) — all passed

---

## B. NEEDS CEO APPROVAL

### B1. Archive candidates (empty — proposed archive only)

| Table | Row count | App refs | FK | Verdict |
|-------|-----------|----------|-----|---------|
| `design_warp` | **0** | 0 in `src/` | → `designs` | **SAFE TO ARCHIVE** (empty) |
| `design_weft` | **0** | 0 in `src/` | → `designs` | **SAFE TO ARCHIVE** (empty) |
| `beam_pipe_in` | **0** | 0 in `src/` | → `beam_pipe_out` | **SAFE TO ARCHIVE** (empty) |
| `order_repair_history` | **N/A** | 0 | — | **NOT IN PRODUCTION SCHEMA** — migration never applied; nothing to archive |

**Do not archive until CEO signs.** When approved: rename to `_archive_*`, export (empty), remove from RLS lists — still do **not** DROP immediately.

### B2. Yarn duplicate groups (approval list — DO NOT MERGE YET)

True duplicates (same supplier + colour_no + quality + spec):

| Group | Canonical ID (proposed) | Duplicate ID | Colour | Quality | Supplier | Stock kg | Ledger/Issue refs |
|-------|-------------------------|--------------|--------|---------|----------|----------|-------------------|
| A | `1c523979-470c-454c-9cda-67ca008dfd5b` | `e26ec557-3b60-41ff-a529-5f0de103d2ab` | 5192 | HSY | FANCY | 974.58 / 291.214 | 0 / 0 |
| B | `e2279d1b-b496-411c-9ef1-a5e66389fb13` | `17eedc44-4d62-4422-9644-23e83e05b621` | 29 | HSY | FANCY | 622.69 / 411.31 | 0 / 0 |

**Recommended action (after approval):** sum stock into canonical → remap any future FKs → soft-deactivate duplicate.  
**Risk note:** Different `stock_kg` may be intentional lot splits — CEO must confirm before merge.

**Not a true duplicate** (same colour_no, different quality — keep both):

| Colour | IDs | Qualities | Reason |
|--------|-----|-----------|--------|
| 0 | `a40949d4-…` / `e118d94d-…` | 300 LICHI vs NSY | Different products |

### B3. Production schema gaps

These tables exist in repo migrations but **are missing from production schema cache**:

- `order_suppliers`
- `inventory_item_master`
- `order_weft_colours`
- `order_repair_history`

**Action:** Apply pending Supabase migrations on production (separate change window). Until then, Order Entry / Item Master features that depend on them will fail at runtime.

---

## C. DO NOT TOUCH

| Item | Reason |
|------|--------|
| `order_book` / `order_book_items` | Production customer fabric orders — KEEP forever as canonical store |
| `dins` / `din_matchings` / `design_costing*` | Design Master source of truth |
| `programs` / `program_petty` / `program_recipe_feeders` | Production pipeline |
| `adjustment_notes` | Settlement history |
| `workers` / `salary_rates` | HR live data |
| Costing formulas / matching recipes / machine numbering | Business logic locked |
| Feeder max = 6 | Locked |
| Automatic master merge | Forbidden until CEO list approved |
| DROP TABLE | Forbidden this phase |

---

## D. PROPOSED FUTURE CLEANUP (do not execute)

### D1. `payroll_rates` → `salary_rates`

| Metric | Count |
|--------|-------|
| `payroll_rates` | 6 |
| `salary_rates` | 23 |

**Usage:** HR uses `salary_rates`; Admin legacy rates UI still writes `payroll_rates`; `dailyCosting.ts` falls back to `payroll_rates`.

**Recommendation:** Ensure every active worker has `salary_rates` → remove fallback → retire Admin Payroll Rates (LEGACY) menu → archive `payroll_rates`.

**Technical safety:** Medium — only after zero fallback usage in Daily Costing.

### D2. `warp_beam_pipe` → `warp_pipes`

| Metric | Count |
|--------|-------|
| `warp_beam_pipe` | 0 |
| `warp_pipes` | 2 |

**Usage:** `WarpYarnManagementScreen` dual-writes; `WarpBeamPipeScreen` still reads legacy.

**Recommendation:** Keep dual-write until historical UI retired; then make `warp_beam_pipe` read-only/archive. Currently empty — low risk but dual-write still in code.

**Technical safety:** Relatively safe (0 legacy rows) after removing dual-write code path.

---

## E. DATA COUNTS (production snapshot)

**Timestamp:** 2026-08-27T21:37:34Z  
**Access:** service_role (read-only queries)

| TABLE | ROW COUNT | REFERENCED BY | APPLICATION USAGE | ACTION | RISK |
|-------|-----------|---------------|-------------------|--------|------|
| `order_book` | **1** | `order_book_items`, `programs` | Customer Order (OTP) | **KEEP** | Critical |
| `order_book_items` | **2** | `programs`, `adjustment_notes` | Lines / matchings / settlement | **KEEP** | Critical |
| `adjustment_notes` | 3 | — | Settlement panel | **KEEP** | Low |
| `programs` | 2 | production, checking, challan | Program to Machine / PD | **KEEP** | Critical |
| `program_petty` | 4 | programs | Meter breakdown | **KEEP** | Low |
| `program_recipe_feeders` | 0 | programs | Max 6 feeders | **KEEP** | Low |
| `dins` | 1 | order_book, costing | Design Intake hub | **KEEP** | Critical |
| `din_matchings` | 2 | order items | Matching recipe | **KEEP** | Critical |
| `design_costing` | 3 | dins, OTP | DIN Costing | **KEEP** | Critical |
| `design_costing_warp` | 4 | design_costing | Warp lines | **KEEP** | Low |
| `design_costing_weft` | 6 | design_costing, feeders | Weft / recipe | **KEEP** | Low |
| `designs` | 3 | design_warp/weft (legacy) | Legacy register | **KEEP** | Low |
| `design_warp` | **0** | — | Unused | **PROPOSED ARCHIVE** | None (empty) |
| `design_weft` | **0** | — | Unused | **PROPOSED ARCHIVE** | None (empty) |
| `party_master` | 0 | OTP, PD | Customer master | **KEEP** | Low |
| `workers` | 18 | HR, attendance, production | Employee master | **KEEP** | Critical |
| `weft_yarn_stock` | 25 | stock, MWP | Yarn inventory | **KEEP** + **PROPOSED MERGE** (2 dupe groups) | Medium |
| `payroll_rates` | 6 | Admin legacy, dailyCosting fallback | Legacy rates | **PROPOSED MERGE** | Medium |
| `salary_rates` | 23 | HR, dailyCosting | Canonical rates | **KEEP** | Critical |
| `warp_beam_pipe` | 0 | Legacy screen + dual-write | Legacy warp | **PROPOSED MERGE** | Low (empty) |
| `warp_pipes` | 2 | Warp Yarn Mgmt | Canonical warp | **KEEP** | Critical |
| `beam_pipe_in` | 0 | — | Unused | **PROPOSED ARCHIVE** | None |
| `beam_pipe_out` | 0 | dashboard count | Legacy | **PROPOSED ARCHIVE** (later) | Low |
| `order_repair_history` | missing | — | Not in prod schema | **PROPOSED REMOVE** N/A | Schema gap |
| `production_entries` | 0 | MWP, PD | Production meters | **KEEP** | Low |
| `checking_lots` | 0 | PD Checking | Checking | **KEEP** | Low |
| `challans` | 1 | Dispatch | Challan | **KEEP** | Low |
| `gatepass` | 1 | Dispatch GP | Gate pass | **KEEP** | Low |

### Customer Order BEFORE / AFTER

| Metric | Count | Notes |
|--------|------:|-------|
| `order_book` headers | 1 | Smoke order `ORD-0001` — Party “Smoke Party…” — status Pending — `din_id` null |
| `order_book_items` lines | 2 | Legacy free-text designs; 1 settled, 1 open |
| DIN-linked lines | 0 | Pre-OTP data |
| Matching-linked lines | 0 | Pre-OTP data |

**Phase 2 was UI-only consolidation.** Expected: **counts unchanged**.  
**Observed:** Data intact; no rows deleted.  
**Mismatch:** None.

Snapshot of preserved rows:

| order_no | party | lines |
|----------|-------|-------|
| ORD-0001 | Smoke Party 1786937390639 | D-1786937390639 Black 100m @50; D-…B White 40m @55 (settled) |

---

## F. DUPLICATE MASTER LIST (approval only)

| Entity | Table | Dup groups | Status |
|--------|-------|------------|--------|
| Customers | `party_master` | 0 | Clean (empty table) |
| Employees | `workers` | 0 | Clean (18 unique names in scan) |
| Yarn | `weft_yarn_stock` | **2 true** (+1 false colour-only) | See §B2 |
| DIN | `dins` | 0 | Clean (1 row) |
| Designs | `designs` | 0 | Clean (3 rows) |
| Suppliers | `order_suppliers` | — | Table missing in prod |
| Items | `inventory_item_master` | — | Table missing in prod |
| Colours | `order_weft_colours` | — | Table missing in prod |

**No IDs changed. No merges executed.**

---

## G. DATABASE ARCHIVE CANDIDATES

| Table | Count | App usage | Last usage | SAFE TO ARCHIVE? | Reason |
|-------|------:|-----------|------------|------------------|--------|
| `design_warp` | 0 | None | Never (empty) | **YES — SAFE TO ARCHIVE** | Zero rows, zero app queries; superseded by `design_costing_warp` |
| `design_weft` | 0 | None | Never (empty) | **YES — SAFE TO ARCHIVE** | Zero rows, zero app queries; superseded by `design_costing_weft` |
| `beam_pipe_in` | 0 | None | Never (empty) | **YES — SAFE TO ARCHIVE** | Zero rows; superseded by `warp_pipes` |
| `order_repair_history` | — | None | N/A | **N/A — NOT IN PROD** | Schema cache miss; apply migrations first or ignore |

**Still requires CEO checkbox before any `ALTER TABLE … RENAME`.**

---

## H. TEST RESULTS

| Test | Result |
|------|--------|
| `npm run build` | **PASS** |
| `npm run audit:phase2` | **PASS** (live production counts) |
| `node scripts/phase2-final-verification.mjs` | **PASS** (artifact JSON written) |
| `module-separation-smoke.mjs` | **PASS** (5 salesman OTP sections, max 6 feeders) |
| `test-design-broadcast-access.mjs` | **PASS** |
| `npm run smoke:ui` | **PASS 26/26** (mobile / tablet / desktop) |
| `npm run smoke:otp` | **PASS** (rate totals, feeders, recipe weight, badges) |
| DB integrity: feeder_no > 6 | **0 rows** |
| DB integrity: programs with order_item_id | 2 (consistent with order lines) |

### Responsive coverage (smoke:ui)

| Device | Viewport | Result |
|--------|----------|--------|
| iPhone | 390×844 | PASS — drawer, bottom nav, modules |
| iPad | 1024×768 | PASS — sidebar, no bottom nav |
| Desktop | 1280×900 | PASS — brand, KPIs, hubs, PD |

Screenshots: `/tmp/cursor/artifacts/screenshots/ui-*.png`

---

## I. REMAINING RISKS

| Risk | Severity | Mitigation |
|------|----------|------------|
| Pending migrations not on production | **High** | Apply Order Entry / Security Inventory migrations in a controlled window |
| Yarn true duplicates (5192, 29) | Medium | CEO approve merge or confirm intentional lot split |
| `payroll_rates` still used as Daily Costing fallback | Medium | Complete salary_rates coverage first |
| Dual-write `warp_beam_pipe` still in code | Low | Remove after archive approval |
| Salesman also sees Reports hub (order deep links) | Low | Acceptable; not HR/Admin |
| Legacy order `ORD-0001` has no DIN | Low | Settlement panel handles; new orders require DIN |
| `party_master` empty while orders use free-text party | Low | ensurePartyMarka populates on next OTP save |

---

## Sidebar / ONE FUNCTION = ONE SCREEN (re-audit)

| Function | Single active screen | Duplicate nav removed? |
|----------|---------------------|------------------------|
| Customer Order | Sales & Order → Customer Order | Yes — Order Book entry redirects |
| Order Status | Sales & Order → Order Status (+ settlement) | Yes |
| Program to Machine | Sales & Order → Program to Machine | Yes |
| Production / Checking / Dispatch | Production & Dispatch | Yes — simplified labels |
| DIN Costing | Design → DIN Costing | Yes |
| Rate Master | Design → Rate Master | Yes |
| Machine Maintenance | Separate module | Yes — not in Sales |
| HR & Payroll | Separate module | Yes |

---

## Program to Machine verification (logic unchanged)

| Field | Source | Status |
|-------|--------|--------|
| Machine | M1–M6 board | Unchanged |
| Warp | Auto from `warp_pipes` / machine board | Unchanged |
| Main Colour | From customer order matching | Unchanged |
| DIN | Linked from order / design | Unchanged |
| Matching | From approved `din_matchings` | Unchanged |
| Recipe feeders | Built from costing wefts, max 6 | **Verified** |
| Recipe edit | Permission-gated (`canEditRecipe`; salesman blocked) | Unchanged |

---

## CEO Sign-off Checklist

- [ ] Acknowledge Phase 2 UI consolidation is safe to merge (#98)
- [ ] Approve / reject archive of empty tables: `design_warp`, `design_weft`, `beam_pipe_in`
- [ ] Review yarn duplicate groups A & B — merge or keep as lots
- [ ] Schedule production migration apply for missing Order Entry / Item Master tables
- [ ] Defer payroll_rates and warp_beam_pipe merges to a later phase

---

## Artifacts

| File | Purpose |
|------|---------|
| `/tmp/cursor/artifacts/phase2-final-verification.json` | Full live DB snapshot |
| `scripts/phase2-final-verification.mjs` | Re-runnable read-only verifier |
| `scripts/phase2-data-audit.mjs` | `npm run audit:phase2` |
| `JAISAL_FW_PHASE2_MIGRATION_REPORT.md` | Earlier Phase 2 migration plan |

---

*Generated by Cloud Agent — Phase 2 Final CEO Verification — READ-ONLY*  
*No irreversible database operations were performed.*
