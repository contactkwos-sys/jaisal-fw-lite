-- Bulk Add Designs: matching photo optional (add later)
alter table public.design_catalog
  alter column matching_image_url drop not null;
