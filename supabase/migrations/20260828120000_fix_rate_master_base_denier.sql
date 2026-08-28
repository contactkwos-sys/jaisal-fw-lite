-- Rate Master denier must store BASE denier (not costing).
-- Seed previously stored 310 for 300 Tex; DIN Costing applies +10 once → was becoming 320.

update public.rate_master
set denier = '300',
    updated_at = now()
where category = 'weft'
  and lower(trim(item_name)) = '300 tex'
  and trim(denier) = '310';

comment on column public.rate_master.denier is
  'Remembered BASE denier for yarn name. DIN Costing applies +10 once at calculation time (costing_denier = base_denier + 10).';
