# DIN Costing / Design — Final Confirmed State

**Verified against:** `main` HEAD `c61f2e9` (live matches)

This is the **FINAL agreed direction** for DIN Costing / Design. Do not reopen removed flows.

## Current confirmed behavior

| Area | Status |
|------|--------|
| **Design Intake page** | **REMOVED** (legacy routes open DIN Costing) |
| **DIN OCR** | **REMOVED entirely** — no text extraction; upload is attach-only |
| **Design No.** | Manual searchable dropdown/combobox (type new or pick existing) |
| **Upload options** | Upload from Photos / Upload from File / Take Photo (+ Gmail) — all attach-only |
| **Warp / Weft / Pick** | All manual entry |
| **Rate Master** | Dropdown + auto-fill rate on selection (unchanged, working) |

## Policy for future PRs

Any future PR that proposes to:

- bring back **OCR-based Design No. detection**, or
- restore the old **Design Intake** page

…should be **rejected / closed without merging**.

## PR hygiene note

Open drafts **#98**, **#99**, **#136**, and **#137** are **unrelated** to Design / DIN Costing (ERP simplification / Security Machine & Production). Stale Design/DIN OCR draft PRs from this thread have already been closed.
