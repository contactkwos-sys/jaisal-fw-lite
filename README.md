# jaisal-fw-lite

Lightweight factory floor app (attendance, stock, design) on Vite + React + Supabase.

## Theme

Design tokens: [`styles/theme.css`](styles/theme.css) (imported via [`styles/base.css`](styles/base.css)). Do not edit those files for feature work — use the tokens in app UI.

## Setup

1. Copy `.env.example` → `.env` and set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`.
2. Apply `supabase/migrations/20260816000100_initial_schema.sql`.
3. Deploy edge functions `pin-login` and `roles-gate` (`verify_jwt = false`).
4. Run `supabase/seed.sql` (or create matching `auth.users` + `public.users`). Demo PIN: `1234`.
5. `npm install` && `npm run dev`

## Screens

- Login — role chips + 4-digit PIN (PBKDF2 via `pin-login`)
- Attendance — date + worker times + auto status
- Stock — Beam Pipe / Weft Yarn; CEO applies, others queue approval
- Design — image upload + rates; conversion charge auto
