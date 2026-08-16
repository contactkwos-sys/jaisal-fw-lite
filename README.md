# jaisal-fw-lite

Lightweight factory floor app (Phases 1–8) on Vite + React + Supabase.

**Live:** https://jaisal-fw-lite.netlify.app

## Theme

Design tokens: [`styles/theme.css`](styles/theme.css) (imported via [`styles/base.css`](styles/base.css)). Do not change the Phase 1 palette (warp `#5b7fb0`, weft `#d9a441`, dark surfaces). Headings use Space Grotesk; numeric fields use IBM Plex Mono.

## Setup

1. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable key uses letter **O** in `OyI39…`, not digit `0`).
2. Apply migrations in order:
   - `supabase/migrations/20260816000100_initial_schema.sql` (Phase 1)
   - `supabase/migrations/20260816000200_phases_2_to_8.sql` (Phases 2–8)
   - Mobile helpers: `public/migration.sql`, `public/migration-phases-2-8.sql`, `public/grants.sql`
3. Deploy edge functions with **`verify_jwt = false`** (see list below).
4. Run `supabase/seed.sql` (or create matching `auth.users` + `public.users`). Demo PIN: `1234`.
5. `npm install` && `npm run dev`

## Manual deploy needed: edge functions

Redeploy / deploy these from the Supabase Dashboard (Edge Functions → Deploy from source). Use `verify_jwt = false`.

| Function | Raw source URL |
|---|---|
| `pin-login` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/pin-login/index.ts |
| `roles-gate` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/roles-gate/index.ts |
| `pin-reset` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/pin-reset/index.ts |

Also mirrored under `public/functions/` for copy/paste deploy.

**Manual deploy needed: `pin-login`, `roles-gate`, `pin-reset`**

`roles-gate` now supports `list` / `create` / `update` / `delete`.  
`pin-reset` (new in Phase 6) hashes a 4-digit PIN with PBKDF2 and upserts `public.users` + auth metadata.

## Screens by phase

| Phase | Status | Screens |
|---|---|---|
| 1 | Live | Login, Attendance, Stock, Design |
| 2 | Built | Weft Purchase (scan/manual/photo), Beam Pipe Out/In, Warp Yarn Inward |
| 3 | Built | Job Card (+ multi colour), Machine Production Entry, Daily Report |
| 4 | Built | Maintenance Request, Repairing Out/In + gatepass |
| 5 | Built | Folding, Challan/Invoice/Bill, Delivery Gatepass + signature pad |
| 6 | Built | Roles & PIN, Payroll (live query), Approval Queue (CEO) |
| 7 | Built | CEO Dashboard (KPIs, quick access, alerts, flow, inline stock edit) |
| 8 | Built | Daily Costing, Electricity Entry, Expense vs Billing / Profit |

CEO login lands on **Home** dashboard. Other roles land on Attendance (Phase 1 behaviour). Bottom nav is scrollable and grows with modules.

## Assumptions (review)

- **Machines:** `M1`–`M6` constant (`MACHINES` in `database.types.ts`).
- **Weft low stock alert:** `WEFT_LOW_STOCK_KG = 50`.
- **Weft purchase → stock:** match on `supplier` + `colour_name` (= quality); else insert new `weft_yarn_stock` row.
- **Beam filled flag:** additive `beam_pipe_stock.is_filled` (does not break Phase 1 UI).
- **Payroll:** no snapshot table — payable = `rate_per_day × present days` for the selected month (Present / On Break / Completed). Worker rate via `workers.role_id`, else `department` matching role name, else average rate fallback for costing.
- **Yarn consumption (costing):** `avg(warp_rate + weft_rate) × today's production meters × 0.08` (same 8% factor as design conversion).
- **Program pending alert:** today's job cards minus distinct machines with production today.
- **Challan / gatepass numbers:** auto-increment prefixes `CH-` / `DG-` / repair `GP-`.
- **Photo uploads:** `factory-uploads` storage bucket.
- **Approval pattern:** CEO applies edits immediately; other roles enqueue to `approval_queue` (same as Phase 1 stock).

## Known follow-ups

1. Deploy edge functions listed above (especially **`pin-reset`** and updated **`roles-gate`**).
2. Confirm Netlify auto-deploy from `main` after merge.
3. Optionally map each worker to `role_id` for accurate payroll.
