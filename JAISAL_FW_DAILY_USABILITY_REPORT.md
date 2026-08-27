# JAISAL FW ERP — Daily Usability Report

**Date:** 27 August 2026  
**Branch:** `cursor/daily-usability-4ef7`  
**Base:** PR #99 simplification tip  
**Mode:** UX only — no DB structure, merge, archive, costing, recipe, or feeder-limit changes

---

## 1. Click count before / after

| Workflow | Before (typical) | After (typical) | Delta |
|----------|------------------|-----------------|-------|
| New Customer Order → Program | 6–8 (full form + status table + re-select order) | **3–4** (min fields → ORDER CREATED → Create Program) | −3 to −4 |
| Program → Production | 3–4 (save → open PD → find program) | **1–2** (Continue to Production with program preselected) | −2 |
| Production → Checking | 2–3 | **1–2** (pending list first) | −1 |
| Checking → Dispatch | 2–3 (gatepass for vehicle) | **1–2** (vehicle/transporter on Dispatch) | −1 |
| CEO find today's work | 4–6 menu hops | **1** (CEO TODAY cards / stage numbers) | −3 to −5 |

---

## 2. Screens used in each workflow

### Customer Order → Program → Production → Checking → Dispatch
1. Sales & Order → **Customer Order** (`OrderToProgramScreen`)
2. Same screen → **Program to Machine**
3. Production & Dispatch → **Production** (`MachineWiseProductionScreen`)
4. Production & Dispatch → **Checking** (`PdFolding`)
5. Production & Dispatch → **Dispatch** (`PdChallan`)

### Design → DIN → Costing → Rate → Sample
Unchanged primary Design module screens (no rewrite).

### Yarn → Stock → Issue → Balance
Inventory / Machine Production weft issue (existing).

### Machine → Breakdown → Spare → Repair → Close
Machine Maintenance (existing).

---

## 3. Duplicate screens found

| Duplicate risk | Action |
|----------------|--------|
| Second order entry | Not created — Order Book entry still redirects |
| Second production entry | Not created — PD embeds Machine-wise Production |
| New menus for Pass/Hold/Reject | Added on existing Checking screen only |
| New dispatch screen | Extended existing Dispatch / Challan |

**ONE FUNCTION = ONE SCREEN** preserved.

---

## 4. Mobile verification (iPhone)

- Global search full-width in topbar
- Sticky Save / Back on Order, Checking, Dispatch
- Touch targets ≥ 48px on quick actions / stage metrics / Pass·Hold·Reject
- Factory stage metrics stack to 1 column
- Smoke: `npm run smoke:ui` (390×844)

---

## 5. iPad verification

- Sidebar shell retained
- Stage cards + TODAY KPIs usable
- Smoke: tablet viewport in `smoke:ui`

---

## 6. Desktop verification

- CEO TODAY hero + TODAY KPIs + QUICK ACTIONS + Daily Factory Flow (ORDER↓PROGRAM↓PRODUCTION↓CHECKING↓DISPATCH with Pending / Today / Completed)
- P&L / machines / inward under **More Details**
- Smoke: desktop viewport in `smoke:ui`

---

## 7. Errors prevented (friendly messages)

| Rule | Message example |
|------|-----------------|
| Missing customer | Please select Customer |
| Missing DIN | Please select Design / DIN |
| Qty ≤ 0 | Please enter Quantity… greater than 0 |
| Invalid rate | Please enter a valid Rate (greater than 0) |
| Program without order | Please select an Order first |
| Production without program | Please select a Program first |
| Dispatch > available | Dispatch Qty cannot be greater than available (…) |
| Hold/Reject without remarks | Please add remarks for Hold or Reject |

Technical DB errors continue to route through `handleUserError` (no raw `customer_id cannot be null`).

---

## 8. Tests passed

| Test | Result |
|------|--------|
| `npm run build` | Pass |
| `node scripts/module-separation-smoke.mjs` | Pass (expected) |
| `npm run smoke:otp` | Pass (expected) |
| `npm run smoke:ui` | Pass (expected after run) |

**Unchanged business rules:** `MAX_FEEDERS = 6` · costing formulas · matching recipe logic · no data merge/archive · no schema migration.

---

## Status labels (display only)

Stored values unchanged. UI maps to: **NEW · PENDING · IN PROGRESS · READY · COMPLETED · HOLD · CANCELLED** via `friendlyFactoryStatus()`.

---

## Remaining notes

- Delivery Date on Customer Order maps to existing `delivery_within_days` (no schema change).
- Invoice on Dispatch is optional note on gate pass; full GST Invoice remains the Invoice primary screen.
- CEO Data Review / yarn merge tools from PR #99 remain approval-only.
