# JAISAL FW — IMPLEMENTATION CHECKLIST (FROM APPROVED DECISIONS)

**Authority:** Recommended options in `JAISAL_FW_CEO_DECISION_SHEET.md` treated as **APPROVE** per FINAL APPROVED IMPLEMENTATION instruction.  
**Locks:** No DB table drops. No unnecessary DB field renames. No parallel implementations. Preserve Daily Costing (separate from Design-wise).  

| ID | Decision | Action | Status |
|----|----------|--------|--------|
| D-01 | Internal Pending naming | RENAME UI to Internal Pending; keep `orders` table separate | DONE |
| D-02 | Real Item Master | BUILD Item Master on `inventory_item_master`; fix Masters link | DONE |
| D-03 | Production Entry | ONE engine = MWP Entry; PD Entry embeds same screen | DONE |
| D-04 | Job Card | Primary under Machine-wise Production; opens `production`/`job` | DONE |
| D-05 | Purchase vs Security | Security = gate entry; Inventory stock/reports; Purchase LEGACY | DONE |
| D-06 | Approvals location | KEEP under Security | DONE |
| D-07 | GEB / Electricity | Daily Costing reads GEB; Settings prefs mislink fixed | DONE |
| D-08 | Sample Register | Archive/Report label | DONE |
| D-09 | Legacy tables | DO NOT DROP any tables | DONE (lock) |
| D-10 | DESI terminology | UI DESI / Design-wise Costing; DB fields unchanged | DONE |
| D-11 | Security vs Inventory | KEEP SEPARATE; nav reflects boundary | DONE |
| D-12 | Repair Out/In | Canonical Material + Security gate; legacy repair labeled | DONE (nav) |
| D-13 | Broadcast vs Promotion | KEEP SEPARATE | DONE (no merge) |
| D-14 | Customer Order vs Order Book | Customer Order primary; Order Book report/adjust | DONE |
| D-15 | Standalone Sample Job Card | LEGACY button only from DTO | DONE |
| D-16 | Dual approval queues | Both tables kept; Approvals UI unchanged | DONE |
| D-17 | User/PIN/Permissions | Moved menus to Settings | DONE |
| D-18 | Module rename | Production → Machine-wise Production; module reorder | DONE |
| D-19 | Mobile bottom nav | Dashboard · DTO · PD · Machine-wise Production | DONE |
| D-20 | Orphan DispatchScreen | LEGACY under PD menu | DONE |
| D-21 | Greige Stock | Misleading menu removed | DONE |
| D-22 | Daily vs Design-wise | KEEP SEPARATE; Daily Factory Costing rename | DONE |
| D-23 | Batch legacy | Program / Beam / Admin Payroll labeled LEGACY | DONE |
| D-24 | Yarn Inward OCR | Single menu under Security only | DONE |

## Explicit non-goals this phase
- Do not DROP tables
- Do not rename `din_number` / `dins` columns
- Do not merge Daily Costing into Design-wise Costing
- Do not invent new top-level modules
- Do not delete page files (LEGACY menus instead)
