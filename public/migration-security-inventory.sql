-- Security Inventory — gate-level entry audit + item master
-- Reuses existing warp / weft / purchase / maintenance tables via link_table + link_id.
-- Does NOT duplicate Warp Yarn Management or weft stock systems.

-- ---------- Standardized item master (maintenance + general + other) ----------
create table if not exists public.inventory_item_master (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null,
  item_code text,
  category text not null default 'general',
  -- maintenance | general | other
  unit text not null default 'NOS',
  description text,
  reorder_level numeric not null default 5,
  is_active boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_item_master_name_key_unique unique (name_key)
);

create index if not exists inventory_item_master_category_idx
  on public.inventory_item_master (category, is_active);
create index if not exists inventory_item_master_name_idx
  on public.inventory_item_master (name);

-- ---------- Qty stock for maintenance / general items ----------
create table if not exists public.inventory_item_stock (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.inventory_item_master (id) on delete cascade,
  stock_qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint inventory_item_stock_item_unique unique (item_id)
);

-- ---------- Security gate entries (audit + pending) ----------
create table if not exists public.security_inventory_entries (
  id uuid primary key default gen_random_uuid(),
  entry_no text not null,
  entry_type text not null,
  -- warp_inward | warp_outward | weft_inward | maint_inward | maint_outward |
  -- maint_return | general_inward | other
  entry_date date not null default current_date,
  entry_time text,
  shift text,
  party_name text,
  supplier text,
  item_name text,
  item_id uuid references public.inventory_item_master (id) on delete set null,
  item_code text,
  quantity numeric not null default 0,
  unit text default 'KG',
  quantity_meter numeric,
  bags_cones numeric,
  challan_no text,
  invoice_no text,
  vehicle_no text,
  person_name text,
  purpose text,
  repair_type text,
  machine_no text,
  department text,
  colour_name text,
  colour_no text,
  quality text,
  denier text,
  yarn_specification text,
  rate numeric,
  gst_pct numeric,
  gst_amount numeric,
  amount numeric,
  invoice_total numeric,
  remarks text,
  status text not null default 'completed',
  -- completed | pending | pending_outward | pending_inward | out_for_repair |
  -- partially_returned | returned | overdue | void | document_pending
  photo_urls jsonb not null default '[]'::jsonb,
  yarn_lines jsonb,
  link_table text,
  link_id uuid,
  parent_entry_id uuid references public.security_inventory_entries (id) on delete set null,
  qty_returned numeric not null default 0,
  expected_return_date date,
  void_reason text,
  voided_by text,
  voided_at timestamptz,
  entered_by text,
  entered_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint security_inventory_entries_entry_no_unique unique (entry_no)
);

create index if not exists security_inventory_entries_date_idx
  on public.security_inventory_entries (entry_date desc, created_at desc);
create index if not exists security_inventory_entries_type_idx
  on public.security_inventory_entries (entry_type);
create index if not exists security_inventory_entries_status_idx
  on public.security_inventory_entries (status);
create index if not exists security_inventory_entries_party_idx
  on public.security_inventory_entries (party_name);
create index if not exists security_inventory_entries_challan_idx
  on public.security_inventory_entries (challan_no);

-- ---------- Uploaded documents ----------
create table if not exists public.security_inventory_documents (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid references public.security_inventory_entries (id) on delete cascade,
  doc_type text not null default 'photo',
  -- invoice | challan | photo | gate_entry
  file_name text,
  file_url text not null,
  uploaded_by text,
  created_at timestamptz not null default now()
);

create index if not exists security_inventory_documents_entry_idx
  on public.security_inventory_documents (entry_id, created_at desc);
create index if not exists security_inventory_documents_created_idx
  on public.security_inventory_documents (created_at desc);

-- RLS (authenticated full access — matches project pattern)
alter table public.inventory_item_master enable row level security;
alter table public.inventory_item_stock enable row level security;
alter table public.security_inventory_entries enable row level security;
alter table public.security_inventory_documents enable row level security;

drop policy if exists inventory_item_master_all on public.inventory_item_master;
create policy inventory_item_master_all on public.inventory_item_master
  for all to authenticated using (true) with check (true);

drop policy if exists inventory_item_stock_all on public.inventory_item_stock;
create policy inventory_item_stock_all on public.inventory_item_stock
  for all to authenticated using (true) with check (true);

drop policy if exists security_inventory_entries_all on public.security_inventory_entries;
create policy security_inventory_entries_all on public.security_inventory_entries
  for all to authenticated using (true) with check (true);

drop policy if exists security_inventory_documents_all on public.security_inventory_documents;
create policy security_inventory_documents_all on public.security_inventory_documents
  for all to authenticated using (true) with check (true);

grant select, insert, update, delete on public.inventory_item_master to authenticated;
grant select, insert, update, delete on public.inventory_item_stock to authenticated;
grant select, insert, update, delete on public.security_inventory_entries to authenticated;
grant select, insert, update, delete on public.security_inventory_documents to authenticated;

-- Seed common maintenance / general items (idempotent via name_key)
insert into public.inventory_item_master (name, name_key, category, unit, item_code, reorder_level)
values
  ('Pick Finder', 'pick finder', 'maintenance', 'NOS', 'M-PF', 5),
  ('Drop Pin', 'drop pin', 'maintenance', 'NOS', 'M-DP', 10),
  ('Bearing', 'bearing', 'maintenance', 'NOS', 'M-BR', 5),
  ('Bearing 6205', 'bearing 6205', 'maintenance', 'NOS', 'M-6205', 5),
  ('Bearing 6206', 'bearing 6206', 'maintenance', 'NOS', 'M-6206', 5),
  ('Fan', 'fan', 'maintenance', 'NOS', 'M-FAN', 2),
  ('Fan (RJM)', 'fan rjm', 'maintenance', 'NOS', 'M-FAN-RJM', 2),
  ('Fan Motor', 'fan motor', 'maintenance', 'NOS', 'M-FM', 2),
  ('Relay', 'relay', 'maintenance', 'NOS', 'M-RL', 5),
  ('Contactor', 'contactor', 'maintenance', 'NOS', 'M-CT', 3),
  ('Sensor', 'sensor', 'maintenance', 'NOS', 'M-SN', 5),
  ('Solenoid Valve', 'solenoid valve', 'maintenance', 'NOS', 'M-SV', 3),
  ('Lubricant Oil', 'lubricant oil', 'maintenance', 'LTR', 'M-LO', 5),
  ('Grease', 'grease', 'maintenance', 'KG', 'M-GR', 3),
  ('Timing Belt', 'timing belt', 'maintenance', 'NOS', 'M-TB', 3),
  ('V-Belt', 'v belt', 'maintenance', 'NOS', 'M-VB', 3),
  ('Coupling', 'coupling', 'maintenance', 'NOS', 'M-CP', 3),
  ('Pulley', 'pulley', 'maintenance', 'NOS', 'M-PL', 3),
  ('Electrical Cable', 'electrical cable', 'maintenance', 'MTR', 'M-EC', 10),
  ('Terminal', 'terminal', 'maintenance', 'NOS', 'M-TM', 20),
  ('Fuse', 'fuse', 'maintenance', 'NOS', 'M-FS', 10),
  ('MCB', 'mcb', 'maintenance', 'NOS', 'M-MCB', 5),
  ('Limit Switch', 'limit switch', 'maintenance', 'NOS', 'M-LS', 5),
  ('Proximity Sensor', 'proximity sensor', 'maintenance', 'NOS', 'M-PS', 5),
  ('Filter', 'filter', 'maintenance', 'NOS', 'M-FL', 5),
  ('Nozzle', 'nozzle', 'maintenance', 'NOS', 'M-NZ', 5),
  ('Spring', 'spring', 'maintenance', 'NOS', 'M-SP', 10),
  ('Washer', 'washer', 'maintenance', 'NOS', 'M-WS', 50),
  ('Nut', 'nut', 'maintenance', 'NOS', 'M-NT', 50),
  ('Bolt', 'bolt', 'maintenance', 'NOS', 'M-BT', 50),
  ('Screw', 'screw', 'maintenance', 'NOS', 'M-SC', 50),
  ('Mechanical Seal', 'mechanical seal', 'maintenance', 'NOS', 'M-MS', 3),
  ('Air Pipe', 'air pipe', 'maintenance', 'MTR', 'M-AP', 10),
  ('Pneumatic Fitting', 'pneumatic fitting', 'maintenance', 'NOS', 'M-PN', 10),
  ('Ghee', 'ghee', 'general', 'KG', 'G-GH', 5),
  ('Toilet Cleaner', 'toilet cleaner', 'general', 'LTR', 'G-TC', 5),
  ('Detergent Powder', 'detergent powder', 'general', 'KG', 'G-DP', 5),
  ('Packing Tape', 'packing tape', 'general', 'NOS', 'G-PT', 10),
  ('Nylon Rope', 'nylon rope', 'general', 'MTR', 'G-NR', 5),
  ('Stationery', 'stationery', 'general', 'NOS', 'G-ST', 10),
  ('Drinking Water', 'drinking water', 'general', 'LTR', 'G-DW', 10),
  ('Cleaning Material', 'cleaning material', 'general', 'NOS', 'G-CM', 5),
  ('Office Consumables', 'office consumables', 'general', 'NOS', 'G-OC', 5)
on conflict (name_key) do nothing;

insert into public.inventory_item_stock (item_id, stock_qty)
select m.id, 0
from public.inventory_item_master m
where not exists (
  select 1 from public.inventory_item_stock s where s.item_id = m.id
);
