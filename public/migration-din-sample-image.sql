-- Physical fabric sample photo — separate from DIN sheet OCR image (design_image_url).
-- Run on Supabase SQL editor if not applied via supabase/migrations.
alter table public.design_costing
  add column if not exists sample_image_url text;

comment on column public.design_costing.sample_image_url is
  'Physical fabric sample photo URL (uploaded after cutting sample from DIN sheet). Separate from design_image_url used for OCR.';
