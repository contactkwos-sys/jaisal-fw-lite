-- Remove DIN Costing OCR-only audit columns.
-- DIN sheet images remain (design_image_url / import_source) as reference attachments.

alter table public.design_costing
  drop column if exists ocr_extracted_json,
  drop column if exists ocr_confirmed_json;

comment on column public.design_costing.design_image_url is
  'Original DIN sheet reference image (upload / Gmail) — not OCR-processed';
