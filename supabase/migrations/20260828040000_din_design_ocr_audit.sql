-- DIN Costing design import / OCR audit trail

alter table public.design_costing
  add column if not exists import_source text,
  add column if not exists design_image_url text,
  add column if not exists ocr_extracted_json jsonb,
  add column if not exists ocr_confirmed_json jsonb;

comment on column public.design_costing.import_source is
  'Design import channel: gmail, photo, file, direct, diary';
comment on column public.design_costing.design_image_url is
  'Original design reference image (Gmail/upload) retained for audit';
comment on column public.design_costing.ocr_extracted_json is
  'Raw OCR / vision extracted values before user edits';
comment on column public.design_costing.ocr_confirmed_json is
  'User-confirmed values applied to costing';

create index if not exists idx_design_costing_import_source
  on public.design_costing (import_source)
  where import_source is not null;
