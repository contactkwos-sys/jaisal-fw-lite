-- Order Entry Module — suppliers, items, orders, history (additive)

-- ---------- Supplier master ----------
create table if not exists public.order_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  name_key text not null,
  contact_person text,
  mobile text,
  whatsapp text,
  whatsapp_business text,
  email text,
  address text,
  gstin text,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint order_suppliers_name_key_unique unique (name_key)
);

create index if not exists order_suppliers_name_idx on public.order_suppliers (supplier_name);

-- ---------- Service provider master (repair) ----------
create table if not exists public.order_service_providers (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  name_key text not null,
  contact_person text,
  mobile text,
  whatsapp text,
  whatsapp_business text,
  machine_category text,
  specialization text,
  address text,
  remarks text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint order_service_providers_name_key_unique unique (name_key)
);

-- ---------- Warp yarn item master ----------
create table if not exists public.order_warp_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  name_key text not null,
  denier text,
  quality_type text,
  last_rate numeric default 0,
  last_supplier_id uuid references public.order_suppliers (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint order_warp_items_name_key_unique unique (name_key)
);

-- ---------- Weft colour master ----------
create table if not exists public.order_weft_colours (
  id uuid primary key default gen_random_uuid(),
  colour_name text not null,
  supplier_colour_no text,
  internal_colour_no text,
  supplier_id uuid references public.order_suppliers (id) on delete set null,
  yarn_quality text,
  denier text,
  last_rate numeric default 0,
  name_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists order_weft_colours_supplier_idx on public.order_weft_colours (supplier_id);
create unique index if not exists order_weft_colours_supplier_key_uidx
  on public.order_weft_colours (supplier_id, name_key)
  where supplier_id is not null;

-- ---------- Maintenance item master ----------
create table if not exists public.order_maint_items (
  id uuid primary key default gen_random_uuid(),
  item_name text not null,
  name_key text not null,
  item_code text,
  specification text,
  unit text default 'Pcs',
  last_rate numeric default 0,
  created_at timestamptz not null default now(),
  constraint order_maint_items_name_key_unique unique (name_key)
);

-- ---------- Order headers ----------
create table if not exists public.order_entries (
  id uuid primary key default gen_random_uuid(),
  order_no text not null,
  order_type text not null,
  order_date date not null default current_date,
  status text not null default 'Draft',
  supplier_id uuid references public.order_suppliers (id) on delete set null,
  service_provider_id uuid references public.order_service_providers (id) on delete set null,
  delivery_party text,
  delivery_date date,
  delivery_timeline text,
  delivery_instructions text,
  contact_person text,
  whatsapp text,
  whatsapp_business text,
  remarks text,
  total_qty numeric not null default 0,
  total_basic numeric not null default 0,
  total_gst numeric not null default 0,
  total_freight numeric not null default 0,
  total_other numeric not null default 0,
  total_payable numeric not null default 0,
  machine_no text,
  machine_name text,
  department text,
  problem_category text,
  problem_description text,
  urgency text,
  requested_date date,
  required_visit_date date,
  preferred_visit_time text,
  expected_completion date,
  whatsapp_message text,
  created_by text,
  updated_by text,
  sent_by text,
  confirmed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_entries_order_no_unique unique (order_no)
);

create index if not exists order_entries_type_idx on public.order_entries (order_type, order_date desc);
create index if not exists order_entries_status_idx on public.order_entries (status);
create index if not exists order_entries_supplier_idx on public.order_entries (supplier_id);

-- ---------- Order line items ----------
create table if not exists public.order_entry_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_entries (id) on delete cascade,
  line_no int not null default 1,
  item_name text,
  denier text,
  quality_type text,
  colour_name text,
  supplier_colour_no text,
  internal_colour_no text,
  item_code text,
  specification text,
  unit text,
  rate numeric not null default 0,
  quantity numeric not null default 0,
  gst_pct numeric not null default 5,
  gst_amount numeric not null default 0,
  freight numeric not null default 0,
  other_charges numeric not null default 0,
  amount numeric not null default 0,
  delivery_date date,
  remarks text
);

create index if not exists order_entry_lines_order_idx on public.order_entry_lines (order_id, line_no);

-- ---------- Communication history ----------
create table if not exists public.order_entry_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_entries (id) on delete cascade,
  activity text not null,
  activity_at timestamptz not null default now(),
  person text,
  communication_mode text,
  message text,
  response text,
  next_followup_date date
);

create index if not exists order_entry_history_order_idx
  on public.order_entry_history (order_id, activity_at desc);

-- ---------- Repair history ----------
create table if not exists public.order_repair_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order_entries (id) on delete cascade,
  machine_no text,
  problem text,
  service_provider_name text,
  call_date date,
  whatsapp_date date,
  technician_name text,
  arrival_date date,
  arrival_time text,
  repair_start timestamptz,
  repair_completed timestamptz,
  repair_cost numeric default 0,
  spare_parts text,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists order_repair_history_order_idx on public.order_repair_history (order_id);

-- RLS
alter table public.order_suppliers enable row level security;
alter table public.order_service_providers enable row level security;
alter table public.order_warp_items enable row level security;
alter table public.order_weft_colours enable row level security;
alter table public.order_maint_items enable row level security;
alter table public.order_entries enable row level security;
alter table public.order_entry_lines enable row level security;
alter table public.order_entry_history enable row level security;
alter table public.order_repair_history enable row level security;

do $$
declare t text;
begin
  foreach t in array array[
    'order_suppliers','order_service_providers','order_warp_items','order_weft_colours',
    'order_maint_items','order_entries','order_entry_lines','order_entry_history','order_repair_history'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_all', t
    );
  end loop;
end $$;

grant all on table public.order_suppliers to authenticated, service_role;
grant all on table public.order_service_providers to authenticated, service_role;
grant all on table public.order_warp_items to authenticated, service_role;
grant all on table public.order_weft_colours to authenticated, service_role;
grant all on table public.order_maint_items to authenticated, service_role;
grant all on table public.order_entries to authenticated, service_role;
grant all on table public.order_entry_lines to authenticated, service_role;
grant all on table public.order_entry_history to authenticated, service_role;
grant all on table public.order_repair_history to authenticated, service_role;
