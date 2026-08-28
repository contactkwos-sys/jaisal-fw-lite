-- Mirror: DIN Costing final business logic (run in Supabase SQL editor if needed)
-- See supabase/migrations/20260828100000_din_costing_final_logic.sql

alter table public.design_costing
  add column if not exists loom_pick numeric;

alter table public.design_costing_warp
  add column if not exists base_denier numeric;

alter table public.design_costing_weft
  add column if not exists base_denier numeric,
  add column if not exists feeder_no int,
  add column if not exists feeder_label text,
  add column if not exists strings_ref text;

alter table public.dins
  add column if not exists main_sample_photo_url text,
  add column if not exists combined_matching_photo_url text,
  add column if not exists approved_sale_rate numeric;
