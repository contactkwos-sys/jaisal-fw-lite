# JAISAL FW ERP — Phase 2 Migration Report

**Date:** 27 August 2026  
**Status:** IMPLEMENTATION IN PROGRESS — **NO DATABASE TABLES DELETED**  
**Prerequisite:** Phase 1 audit + navigation cleanup (PR #97)

---

## Executive Summary

Phase 2 consolidates **Customer Order** into one canonical UI, extracts **settlement/adjustment** into a shared component, unifies **order number generation**, and documents all database merge/archive candidates. **Production data is preserved.** Irreversible table removal requires explicit CEO approval after live row-count verification.

---

## 1. Tables to KEEP (production-critical)

| Table | Purpose | App usage | Record policy |
|-------|---------|-----------|---------------|
| `order_book` | Customer fabric order header | 17+ files | **KEEP** — all rows preserved |
| `order_book_items` | Order lines / matchings | 25+ files | **KEEP** |
| `dins` | DIN hub | 13+ files | **KEEP** |
| `din_matchings` | Matching recipe | designToOrder, OTP | **KEEP** |
| `design_costing` + warp/weft lines | DIN costing | DesignWiseCosting, OTP | **KEEP** |
| `programs` | Machine programs | OTP, PD, MWP | **KEEP** |
| `program_recipe_feeders` | Max 6 feeders | OTP | **KEEP** |
| `adjustment_notes` | Short-meter settlement | OrderSettlementPanel | **KEEP** |
| `party_master` | Customer parties | Orders, PD | **KEEP** |
| `workers` | Employees | HR, production | **KEEP** |
| `weft_yarn_stock` | Weft inventory | Stock, MWP | **KEEP** |
| `order_entries` | Supplier POs (not fabric) | OrderEntryScreen | **KEEP** — separate domain |
| `orders` | Internal factory tasks | OrdersPendingScreen | **KEEP** — separate domain |
| `gatepass` | Dispatch gate pass | PD | **KEEP** |
| `gate_pass` | Maintenance gate pass | Security, maint-material | **KEEP** |
| `warp_gate_passes` | Warp warper gate pass | Warp beam stock | **KEEP** |
| `salary_rates` | HR payroll rates | HR module | **KEEP** (canonical) |
| `rate_master` | Yarn rates | Rate Master, costing | **KEEP** |

---

## 2. Tables to MERGE (over time — not dropped in Phase 2)

| Source | Target | Action | Data risk |
|--------|--------|--------|-----------|
| `payroll_rates` | `salary_rates` | Map legacy role rates → worker rates | Medium — run per-worker |
| `warp_beam_pipe` | `warp_pipes` | Finish dual-write migration | Medium |
| `beam_pipe_stock` | `warp_pipes` / godown views | Consolidate UI reads | Medium |
| Legacy Order Book **UI** | `OrderToProgramScreen` | **DONE** — entry redirected | None — same tables |
| `programDispatch.nextOrderNo` | `orderBookShared.nextCustomerOrderNo` | **DONE** — unified ORD0001 | None |

---

## 3. Tables to ARCHIVE (proposed — **NOT EXECUTED**)

| Table | Purpose | Current usage | Dependencies | Proposed action |
|-------|---------|---------------|--------------|-----------------|
| `design_warp` | Legacy design warp lines | **0** app queries | FK → `designs` | Rename to `_archive_design_warp` after export |
| `design_weft` | Legacy design weft lines | **0** app queries | FK → `designs` | Rename to `_archive_design_weft` after export |
| `beam_pipe_in` | Legacy pipe IN | **0** app queries | FK → `beam_pipe_out` | Archive after row export |
| `order_repair_history` | PO repair history | **0** app queries | FK → `order_entries` | Wire UI or archive |

**Archive procedure (when approved):**
1. `SELECT count(*)` on production
2. Export CSV to secure backup
3. `ALTER TABLE … RENAME TO _archive_*`
4. Remove from RLS policy lists
5. Verify app smoke tests
6. **Do not DROP** until 30-day verification window

---

## 4. Tables to REMOVE

**None in Phase 2.** Zero tables meet the removal criteria (zero usage + zero dependencies + verified backup).

---

## 5. Customer Order Field Mapping (Phase 2A)

### Canonical UI
**Sales & Order → Customer Order** (`OrderToProgramScreen` / `saveCustomerOrder`)

### Legacy UI (retired for new entry)
**Order Book → New Order** — redirects to canonical Customer Order. Historical rows unchanged.

| Old field (Order Book) | New field (Customer Order) | Migration |
|------------------------|----------------------------|-----------|
| `party_name` | `party_name` | N/A — same column |
| `order_date` | `order_date` | N/A |
| `delivery_date` | `delivery_within_days` | **Not auto-converted** — legacy rows keep `delivery_date` |
| `payment_days` | `payment_terms` | **Not auto-converted** — legacy rows keep `payment_days` |
| `remarks` | `remarks` | N/A |
| `discount_pct` | `discount_pct` | N/A |
| `design_no` (free text) | `din_id` + DIN number | Legacy lines: `din_id` NULL — **preserved** |
| `colour` | `colour` / matching colour | N/A |
| `quality` (line) | `quality_name` (header) | Legacy keeps line `quality` |
| `total_pcs` | — | **Preserved on legacy items only** |
| `qty_meter` | `qty_meter` | N/A |
| `rate` (line) | `sales_rate` (header) | Legacy keeps line `rate` |
| `status = 'Pending'` | `'ORDER RECEIVED'` | **Not rewritten** — historical meaning preserved |
| — | `matching_no`, `matching_id` | New orders only |
| Marka side-effect | `ensurePartyMarka()` | **Added to canonical save** |

### Record count verification
Run before/after any DB migration:
```bash
node scripts/phase2-data-audit.mjs
```
Compare `orderBook.headers`, `orderBook.lines`, `orderBook.legacyLinesEstimate`.

**Expected after Phase 2A UI-only:** counts unchanged.

---

## 6. Master Data Deduplication (Phase 2B)

**Policy:** CANONICAL → MAP DUPLICATES → UPDATE REFERENCES → VERIFY → ARCHIVE

| Entity | Table | Dedup key | Existing guard | Phase 2 action |
|--------|-------|-----------|----------------|----------------|
| Customers | `party_master` | `party_name` (unique) | Bulk import skip | Audit script only |
| Employees | `workers` | `employee_code` | HR UI block | Audit script only |
| Yarn | `weft_yarn_stock` | composite | `findDuplicateYarn()` warn | Audit script only |
| DIN | `dins` | `din_number` (unique) | Sequential gen | Audit script only |
| Suppliers | `order_suppliers` | `name_key` (unique) | `ensureSupplier()` | Audit script only |
| Items | `inventory_item_master` | `name_key` (unique) | DB constraint | Audit script only |

**No automatic merge in Phase 2.** Audit output flags duplicate groups for manual CEO review.

---

## 7. Dependencies

```
order_book → order_book_items → programs → production_entries
                                    ↓
                              checking_lots → challans → gatepass

dins → din_matchings → design_costing
     → order_book (din_id)

adjustment_notes → order_book_items (CASCADE)
```

**Do not archive `order_book*` or `adjustment_notes`.**

---

## 8. Rollback Plan

| Change type | Rollback |
|-------------|----------|
| UI consolidation | Revert git commit; Order Book entry form still in git history |
| Unified order numbers | Both ORD0001 and ORD-0001 remain valid; `nextDocNo` reads max digit |
| Settlement component | Revert to inline OrderBookScreen logic |
| Table archive (future) | `ALTER TABLE _archive_* RENAME TO original` + restore RLS |

---

## 9. Phase 2 Code Changes (this PR)

| Item | Status |
|------|--------|
| `orderBookShared.ts` — field mapping, unified order no, settlement API | ✅ |
| `OrderSettlementPanel.tsx` — shared settlement UI | ✅ |
| `OrderBookScreen` — entry redirect; settlement only | ✅ |
| `OrderToProgramScreen` — settlement under Order Status | ✅ |
| `saveCustomerOrder` — `ensurePartyMarka` | ✅ |
| `programDispatch.nextOrderNo` — unified export | ✅ |
| Nav Phase 2F — Production & Dispatch simplified | ✅ |
| Roles Phase 2G — Salesman + follow-up (5 items) | ✅ |
| `scripts/phase2-data-audit.mjs` | ✅ |
| Database table DROP/ARCHIVE | ❌ **Not executed** |

---

## 10. Test Results

| Test | Result |
|------|--------|
| `npm run build` | Pending CI |
| `module-separation-smoke.mjs` | Pending |
| `smoke:ui` | Pending |
| Live record counts | Run `phase2-data-audit.mjs` with Supabase env |

---

## 11. Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| Legacy orders without DIN cannot use OTP entry | Low | Settlement panel handles all lines |
| `payment_days` vs `payment_terms` dual columns | Low | Document; no auto-migration |
| Two order number formats in DB (ORD0001 / ORD-0001) | Low | Unified generator reads both |
| Orphan tables still in RLS lists | Low | Remove when archived |
| Master duplicate merge not automated | Medium | CEO review audit script output |

---

## 12. Approval Required Before Next Steps

- [ ] CEO confirms Phase 2A UI consolidation
- [ ] Live row counts from `phase2-data-audit.mjs` reviewed
- [ ] Archive migration SQL approved table-by-table
- [ ] Master dedup merge list approved with canonical ID per group

**Until approved: no `DROP TABLE`, no `DELETE FROM` master records.**

---

*Generated by Cloud Agent — Phase 2 Safe Consolidation*
