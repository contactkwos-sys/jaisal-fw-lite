-- Design Wise Costing: design length, PIC conversion rate vs weaving charge,
-- warp/weft totals, status, and audit columns. Does not drop or recreate tables.

alter table public.design_costing
  add column if not exists design_length_mtr numeric,
  add column if not exists pic_conversion_rate numeric not null default 0.45,
  add column if not exists total_pic numeric,
  add column if not exists total_warp_weight_kg numeric,
  add column if not exists total_weft_weight_kg numeric,
  add column if not exists total_warp_amount numeric,
  add column if not exists total_weft_amount numeric,
  add column if not exists status text not null default 'draft',
  add column if not exists updated_by uuid references auth.users(id),
  add column if not exists updated_at timestamptz default now();

comment on column public.design_costing.pic_conversion_rate is
  '₹ per PIC — editable rate; weaving charge = total_pic × pic_conversion_rate';
comment on column public.design_costing.conversion_charge is
  'Calculated weaving charge amount (total_pic × pic_conversion_rate)';
comment on column public.design_costing.design_length_mtr is
  'Design / base length in meters used for yarn cost per meter';
comment on column public.design_costing.status is
  'draft | final';

-- Previous UI stored the PIC rate in conversion_charge. Copy into pic_conversion_rate
-- when the stored value looks like a rate (small positive), without wiping other data.
update public.design_costing
set pic_conversion_rate = conversion_charge
where conversion_charge is not null
  and conversion_charge > 0
  and conversion_charge <= 10
  and (pic_conversion_rate is null or pic_conversion_rate = 0.45);

alter table public.design_costing
  drop constraint if exists design_costing_status_check;

alter table public.design_costing
  add constraint design_costing_status_check
  check (status in ('draft', 'final'));
