# jaisal-fw-lite

Lightweight factory floor app (Phases 1–8) on Vite + React + Supabase.

**Live (GitHub Pages):** https://contactkwos-sys.github.io/jaisal-fw-lite/

**Netlify (paused — usage limit):** https://jaisal-fw-lite.netlify.app — restore by upgrading the Netlify plan or waiting for the billing cycle reset, then redeploy from the Netlify dashboard.

## Theme

Design tokens: [`styles/theme.css`](styles/theme.css) (imported via [`styles/base.css`](styles/base.css)). Premium light industrial palette: deep teal primary, mint selected states, amber accent, white cards on light grey. Headings use Outfit; body uses DM Sans; numeric fields use IBM Plex Mono.

Navigation is capped at **main modules** (Dashboard, Program & Dispatch, Inventory, Cash Book, Orders & Pending, Reports, Maintenance, Masters, Security, Settings). Existing screens are grouped as sub-items / module hubs. Role-based module access is configured under Security → Permissions (defaults by role; CEO can override).

**Program & Dispatch** consolidates order → machine program → production entry → folding/checking lots → challan → gate pass → GST invoice. Migration: `supabase/migrations/20260821140000_program_dispatch_module.sql` (mirrored as `public/migration-program-dispatch.sql`).

## Setup

1. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (publishable key uses letter **O** in `OyI39…`, not digit `0`).
2. Apply migrations in order:
   - `supabase/migrations/20260816000100_initial_schema.sql` (Phase 1)
   - `supabase/migrations/20260816000200_phases_2_to_8.sql` (Phases 2–8)
   - `supabase/migrations/20260817000100_design_warp_weft_costing.sql` (Design Master structured costing)
   - `supabase/migrations/20260817000200_purchase_inward_rebuild.sql` (Purchase & Inward rebuild)
   - `supabase/migrations/20260817000300_order_program_dispatch.sql` (Order Book → Program → Job Card → Dispatch)
   - `supabase/migrations/20260817000400_design_broadcast_party_master.sql` (Design Broadcast + Party Master)
   - Mobile helpers: `public/migration.sql`, `public/migration-phases-2-8.sql`, `public/migration-design-costing.sql`, `public/migration-purchase-inward.sql`, `public/migration-order-program.sql`, `public/migration-design-broadcast-party.sql`, `public/grants.sql`
3. Deploy edge functions with **`verify_jwt = false`** (see list below).
4. Run `supabase/seed.sql` (or create matching `auth.users` + `public.users`). Demo PIN: `1234`.
5. `npm install` && `npm run dev`

## Manual deploy needed: edge functions

Redeploy / deploy these from the Supabase Dashboard (Edge Functions → Deploy from source). Use `verify_jwt = false`.

| Function | Raw source URL | Status (this run) |
|---|---|---|
| `pin-login` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/pin-login/index.ts | Already ACTIVE (unchanged) |
| `roles-gate` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/roles-gate/index.ts | Redeployed (update/delete actions) |
| `pin-reset` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/pin-reset/index.ts | Deployed |
| `gmail-intake` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/gmail-intake/index.ts | Deployed (Gmail OAuth + import) |
| `design-ocr` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/design-ocr/index.ts | **Deploy required** — reads JFG / Pick / Strings from design sheets (Design Intake + DIN Costing) |
| `invoice-ocr` | https://raw.githubusercontent.com/contactkwos-sys/jaisal-fw-lite/main/supabase/functions/invoice-ocr/index.ts | Optional — purchase invoice OCR |

Also mirrored under `public/functions/` for copy/paste deploy.

**Manual deploy needed (if CLI deploy unavailable):** `pin-login`, `roles-gate`, `pin-reset`, `gmail-intake`, **`design-ocr`**

**Design OCR edge function secret** (Supabase Dashboard → Edge Functions → design-ocr → Secrets):

- `ANTHROPIC_API_KEY` — Anthropic API key for Claude Vision (required for reliable design sheet reading on phone photos)

Without `design-ocr` deployed, Design Intake falls back to browser Tesseract which often cannot read jacquard design sheets.

**Gmail edge function secrets** (Supabase Dashboard → Edge Functions → gmail-intake → Secrets):

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — Google Cloud OAuth credentials
- `GMAIL_TOKEN_SECRET` — 32+ char secret for encrypting OAuth tokens
- Optional: `GMAIL_INTAKE_EMAIL` (default `jaisalind2@gmail.com`), `GMAIL_SUCCESS_REDIRECT`, `GOOGLE_REDIRECT_URI`

**Gmail database migration:** run `public/migration-gmail-design-intake.sql` (or `supabase/migrations/20260822100000_gmail_design_intake.sql`) if `gmail_approved_senders` is missing.

`roles-gate` now supports `list` / `create` / `update` / `delete`.  
`pin-reset` (new in Phase 6) hashes a 4-digit PIN with PBKDF2 and upserts `public.users` + auth metadata.

## Deploy confirmation (Phases 2–8 run)

- Migration `20260816000200_phases_2_to_8.sql` applied on live project `doitrzsyvcipugmrzykx` (tables verified).
- `main` merged via PR https://github.com/contactkwos-sys/jaisal-fw-lite/pull/5
- Netlify production https://jaisal-fw-lite.netlify.app serving build with CEO Dashboard / Costing / Purchase modules
- Edge functions `pin-reset` + updated `roles-gate` deployed via Supabase CLI (`verify_jwt=false`)

## Deploy confirmation (responsive AppShell nav)

- PR https://github.com/contactkwos-sys/jaisal-fw-lite/pull/8 merged to `main` (`58dd22b`)
- Netlify production redeployed; live bundle includes `app-sidebar` / `1024px` breakpoint / `kpi-grid-5` (no bottom tabs)
- Smoke test `npm run smoke:prod`: **16/16 PASS** ×2 (mobile drawer + desktop fixed sidebar, CEO login PIN `1234`, dashboard KPIs/flow/tables, Production / Dispatch / Design reachable)
- Follow-up PR https://github.com/contactkwos-sys/jaisal-fw-lite/pull/10 merged (`83c146b`): CEO Dashboard/Costing nav visibility when roles join is null — live as `index-CY6oslKs.js`

## Deploy confirmation (Order Book → Program → Dispatch)

- Migration `20260817000300_order_program_dispatch.sql` applied on live project `doitrzsyvcipugmrzykx` (tables `order_book`, `order_book_items`, `programs`, `program_petty`, `adjustment_notes` + job/challan/program columns)
- Screens: Order Book (+ Party Delivery Report + Adjust), Program Card / Pending Tracker, Job Card Issue (A4 2×2 print), Security Gate consolidated logs, Dispatch links job/program and completes on dual-signed gatepass
- Merged via PR https://github.com/contactkwos-sys/jaisal-fw-lite/pull/11 (`a5aaa3b`); Netlify live `index-CivxuqZv.js`
- API smoke `node scripts/order-flow-api-smoke.mjs`: order → program → job → dispatch complete → 3 adjustments **PASS**

## Deploy confirmation (Design Broadcast + Party Master)

- Migration `20260817000400_design_broadcast_party_master.sql` applied on live project (`design_broadcasts`, `party_master`)
- Design Broadcast: select design, main + colour-chart uploads to `design-images`, WhatsApp / WhatsApp Business via Web Share API
- Party Master: bulk paste + single add; Order Book party field suggests from `party_master`


## Screens by phase

| Phase | Status | Screens |
|---|---|---|
| 1 | Live | Login, Attendance, Stock, Design |
| 2 | Built | Purchase & Inward: General Purchase, Weft Yarn (multi-item), Maintenance Inward, Repair Invoice, Purchase Report |
| 3 | Built | Job Card (+ multi colour), Machine Production Entry, Daily Report |
| 4 | Built | Maintenance Request, Repairing Out/In + gatepass |
| 5 | Built | Folding, Challan/Invoice/Bill, Delivery Gatepass + signature pad |
| 6 | Built | Roles & PIN, Payroll (live query), Approval Queue (CEO) |
| 7 | Built | CEO Dashboard (KPIs, quick access, alerts, flow, inline stock edit) |
| 8 | Built | Daily Costing, Electricity Entry, Expense vs Billing / Profit |
| 9 | Not built | OCR / image-reading to auto-extract Design No. and Pick count from uploaded design photos |
| 10 | Built | Order Book → Program → Job Card Issue → Dispatch completion + Party-wise Delivery Report + Adjust |
| 11 | Built | Design Broadcast (2 photos + Web Share) + Party Master bulk-add |

CEO login lands on **Home** dashboard. Other roles land on Attendance (Phase 1 behaviour). Navigation uses a shared `AppShell`: mobile (<1024px) left drawer with hamburger; desktop/iPad (≥1024px) fixed left sidebar (never collapsed).

## Design Master costing (live)

Replaces the old placeholder `Selling Rate − ((Warp Rate + Weft Rate) × 0.08)`.

- **Warp weight** = `(Denier × TAR × Length) / 9_000_000`
- **Weft weight** = `(Denier × Pic × Width × Length) / 9_000_000`
- **Amount** = Weight × Rate
- **Wastage** = Total Yarn Cost × `WASTAGE_PCT` (`0.05` in `src/lib/designCosting.ts`)
- **Final Cost / Meter** = Total Yarn Cost + Wastage + Total Conversion
- Weft Rate auto-suggest: latest `design_weft` row with same Item/Colour (case-insensitive)
- Screen uses a light palette scoped in `src/styles/design-costing.css` (does not change global theme)

Verified example: Denier 155, TAR 8900, Length 110, Rate 121 → Warp Weight ≈ 16.86, Amount ≈ 2040.

## Assumptions (review)

- **Machines:** `M1`–`M6` constant (`MACHINES` in `database.types.ts`).
- **Weft low stock alert:** `WEFT_LOW_STOCK_KG = 50`.
- **Weft purchase → stock:** match on `supplier` + `colour_name` (= quality); else insert new `weft_yarn_stock` row.
- **Beam filled flag:** additive `beam_pipe_stock.is_filled` (does not break Phase 1 UI).
- **Payroll:** no snapshot table — payable = `rate_per_day × present days` for the selected month (Present / On Break / Completed). Worker rate via `workers.role_id`, else `department` matching role name, else average rate fallback for costing.
- **Yarn consumption (costing paper):** average yarn `amount` across `design_warp` + `design_weft` × today's production meters.
- **Design Master wastage:** `WASTAGE_PCT = 0.05` in `src/lib/designCosting.ts`.
- **Program pending alert:** today's job cards minus distinct machines with production today.
- **Challan / gatepass numbers:** auto-increment prefixes `CH-` / `DG-` / repair `GP-`.
- **Photo uploads:** `factory-uploads` storage bucket.
- **Approval pattern:** CEO applies edits immediately; other roles enqueue to `approval_queue` (same as Phase 1 stock).

## Known follow-ups

1. Optionally map each worker to `role_id` for accurate payroll.
2. If PIN reset fails after a dashboard re-deploy, re-run `supabase functions deploy pin-reset --no-verify-jwt` (and `roles-gate`).
3. **Phase 9 — not built:** OCR/image-reading to auto-extract Design No. and Pick count from uploaded design photos (TODO left at image upload in Design Master).
