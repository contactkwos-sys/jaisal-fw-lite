-- DIN Costing final business logic — base denier, loom pick, feeder labels, final sample
-- Additive only. Does not rebuild tables or change generated weight formulas (still use denier).

-- Header: source TOTAL LOOM PICK (never overwritten by Σ weft PIC)
alter table public.design_costing
  add column if not exists loom_pick numeric;

comment on column public.design_costing.loom_pick is
  'TOTAL LOOM PICK from design reference — separate from total_pic (Σ weft PIC rows)';

comment on column public.design_costing.total_pic is
  'TOTAL WEFT PIC — sum of individual weft PIC rows used for weaving charge';

comment on column public.design_costing.design_length_mtr is
  'Production length (m) — yarn consumption basis (default 110)';

comment on column public.design_costing.usable_length_mtr is
  'Customer usable length (m) — per-meter costing basis (default 100 = 110 − 10 wastage)';

-- Warp: store entered base denier separately; denier column remains COSTING denier for generated weight
alter table public.design_costing_warp
  add column if not exists base_denier numeric;

comment on column public.design_costing_warp.base_denier is
  'Entered / remembered yarn denier. Costing denier = base_denier + 10 (stored in denier)';

comment on column public.design_costing_warp.denier is
  'Costing denier used in weight formula (= base_denier + 10 when base is set)';

-- Weft: base denier + feeder/colour mapping + strings OCR reference (not for costing)
alter table public.design_costing_weft
  add column if not exists base_denier numeric,
  add column if not exists feeder_no int,
  add column if not exists feeder_label text,
  add column if not exists strings_ref text;

comment on column public.design_costing_weft.base_denier is
  'Entered / remembered yarn denier. Costing denier = base_denier + 10 (stored in denier)';

comment on column public.design_costing_weft.denier is
  'Costing denier used in weight formula (= base_denier + 10 when base is set)';

comment on column public.design_costing_weft.feeder_no is
  'Feeder/Colour position number (1-based) from design reference';

comment on column public.design_costing_weft.feeder_label is
  'Display label e.g. Colour 1 / Feeder 1';

comment on column public.design_costing_weft.strings_ref is
  'OCR Strings reference only — NEVER used in pick, weight, or costing calculations';

-- Rate Master denier = remembered BASE denier per yarn (not costing denier)
comment on column public.rate_master.denier is
  'Remembered BASE denier for yarn name. DIN Costing applies +10 at calculation time.';

-- Final Sample (customer/sales-facing) on same Design Master (dins) — not a duplicate design
alter table public.dins
  add column if not exists main_sample_photo_url text,
  add column if not exists combined_matching_photo_url text,
  add column if not exists approved_sale_rate numeric;

comment on column public.dins.din_image_url is
  'INTERNAL DIN/design reference image — not for salesman/customer promotion';

comment on column public.dins.main_sample_photo_url is
  'Customer/sales Main Sample Photo (after physical sample) — one complete design photo';

comment on column public.dins.combined_matching_photo_url is
  'Customer/sales Combined Matching Photo — ONE photo with all matchings together';

comment on column public.dins.approved_sale_rate is
  'CEO-approved sale rate exposed to salesman/order screens';
