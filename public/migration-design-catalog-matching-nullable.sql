-- Mirror of supabase/migrations/20260818000300_design_catalog_matching_nullable.sql
alter table public.design_catalog
  alter column matching_image_url drop not null;
