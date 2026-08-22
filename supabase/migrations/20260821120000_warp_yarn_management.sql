-- Warp Yarn Management — pipe lifecycle (additive; does not drop existing data)
-- Reuses beam_loading / daily_beam_production for machine meter consumption.
-- Does not duplicate weft yarn stock or variety-level beam_pipe_stock.

-- ---------- Pipe master (unique serial) ----------
create table if not exists public.warp_pipes (
  id uuid primary key default gen_random_uuid(),
  pipe_no text not null,
  serial_no text,
  location text not null default 'Godown',
  status text not null default 'EMPTY',
  -- EMPTY | FILLED_GODOWN | ON_MACHINE | AT_WARPER | DAMAGED | UNDER_REPAIR | ISSUED
  yarn_quality text,
  yarn_specification text,
  meter numeric not null default 0,
  multiplier numeric not null default 2,
  total_meter numeric not null default 0,
  used_meter numeric not null default 0,
  balance_meter numeric not null default 0,
  weight_kg numeric not null default 0,
  machine_no text,
  warper_name text,
  last_used_at timestamptz,
  remarks text,
  beam_loading_id uuid references public.beam_loading (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warp_pipes_pipe_no_unique unique (pipe_no)
);

create unique index if not exists warp_pipes_serial_no_uidx
  on public.warp_pipes (serial_no)
  where serial_no is not null and length(trim(serial_no)) > 0;

create index if not exists warp_pipes_status_idx on public.warp_pipes (status);
create index if not exists warp_pipes_machine_idx on public.warp_pipes (machine_no);
create index if not exists warp_pipes_quality_idx on public.warp_pipes (yarn_quality);

-- ---------- Movement / transaction ledger ----------
create table if not exists public.warp_yarn_transactions (
  id uuid primary key default gen_random_uuid(),
  txn_date date not null default current_date,
  pipe_id uuid references public.warp_pipes (id) on delete set null,
  pipe_no text not null,
  txn_type text not null,
  -- Purchase Yarn | Send to Warper | Receive from Warper | Issue to Machine |
  -- Return from Machine | Move to Godown | Empty Pipe | Adjustment
  from_location text,
  to_location text,
  quality text,
  kg numeric not null default 0,
  meter numeric not null default 0,
  multiplier numeric not null default 2,
  total_meter numeric not null default 0,
  balance_meter numeric,
  machine_no text,
  warper_name text,
  user_name text,
  reference text,
  status text,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists warp_yarn_txns_date_idx
  on public.warp_yarn_transactions (txn_date desc, created_at desc);
create index if not exists warp_yarn_txns_pipe_idx
  on public.warp_yarn_transactions (pipe_no, created_at desc);
create index if not exists warp_yarn_txns_type_idx
  on public.warp_yarn_transactions (txn_type);

-- ---------- Warp yarn purchases ----------
create table if not exists public.warp_yarn_purchases (
  id uuid primary key default gen_random_uuid(),
  purchase_date date not null default current_date,
  supplier text not null,
  invoice_no text,
  yarn_quality text not null,
  yarn_specification text,
  quantity_kg numeric not null default 0,
  rate numeric not null default 0,
  amount numeric not null default 0,
  gst_pct numeric not null default 0,
  total_amount numeric not null default 0,
  destination text,
  remarks text,
  entered_by text,
  created_at timestamptz not null default now()
);

create index if not exists warp_yarn_purchases_date_idx
  on public.warp_yarn_purchases (purchase_date desc);

-- ---------- Warper / job-work send–receive ----------
create table if not exists public.warp_warper_jobs (
  id uuid primary key default gen_random_uuid(),
  pipe_id uuid references public.warp_pipes (id) on delete set null,
  pipe_no text not null,
  warper_name text not null,
  yarn_quality text,
  sent_date date not null default current_date,
  yarn_sent_kg numeric not null default 0,
  expected_meter numeric not null default 0,
  multiplier numeric not null default 2,
  expected_total_meter numeric not null default 0,
  challan_no text,
  remarks text,
  received_date date,
  received_meter numeric,
  received_kg numeric,
  meter_difference numeric,
  kg_difference numeric,
  status text not null default 'SENT',
  -- SENT | IN_PROCESS | RECEIVED | DIFFERENCE
  entered_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists warp_warper_jobs_status_idx on public.warp_warper_jobs (status);
create index if not exists warp_warper_jobs_pipe_idx on public.warp_warper_jobs (pipe_no);

-- Keep pipe used/balance in sync when beam_loading remaining changes (production)
create or replace function public.fn_sync_warp_pipe_from_beam()
returns trigger as $$
begin
  update public.warp_pipes
  set
    used_meter = greatest(coalesce(total_meter, 0) - coalesce(new.remaining_meter, 0), 0),
    balance_meter = greatest(coalesce(new.remaining_meter, 0), 0),
    updated_at = now(),
    last_used_at = now()
  where beam_loading_id = new.id
    and status = 'ON_MACHINE';
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_sync_warp_pipe_from_beam on public.beam_loading;
create trigger trg_sync_warp_pipe_from_beam
after update of remaining_meter on public.beam_loading
for each row
when (old.remaining_meter is distinct from new.remaining_meter)
execute function public.fn_sync_warp_pipe_from_beam();

-- Backfill pipes from running beam_loading rows (idempotent by pipe_no)
insert into public.warp_pipes (
  pipe_no, serial_no, location, status, yarn_quality, meter, multiplier,
  total_meter, used_meter, balance_meter, machine_no, beam_loading_id, remarks
)
select
  coalesce(nullif(trim(bl.pipe_no), ''), 'BL-' || substr(bl.id::text, 1, 8)) as pipe_no,
  coalesce(nullif(trim(bl.pipe_no), ''), 'BL-' || substr(bl.id::text, 1, 8)) as serial_no,
  'Machine ' || bl.machine_no,
  'ON_MACHINE',
  coalesce(bl.quality, bl.item_name),
  coalesce(bl.meter_per_beam, 0),
  greatest(coalesce(bl.beam_count, 1), 1),
  coalesce(bl.total_loaded_meter, coalesce(bl.meter_per_beam, 0) * greatest(coalesce(bl.beam_count, 1), 1)),
  greatest(
    coalesce(bl.total_loaded_meter, 0) - coalesce(bl.remaining_meter, 0),
    0
  ),
  coalesce(bl.remaining_meter, 0),
  bl.machine_no,
  bl.id,
  'Backfilled from beam_loading'
from public.beam_loading bl
where bl.status = 'RUNNING'
  and not exists (
    select 1 from public.warp_pipes wp
    where wp.pipe_no = coalesce(nullif(trim(bl.pipe_no), ''), 'BL-' || substr(bl.id::text, 1, 8))
       or wp.beam_loading_id = bl.id
  );

-- Seed empty pipes from beam_pipe_stock variety counts (EMPTY only; no fill data)
do $$
declare
  r record;
  i int;
  next_n int;
  pno text;
begin
  select coalesce(max(
    case when pipe_no ~ '^BP-[0-9]+$'
      then nullif(regexp_replace(pipe_no, '^BP-', ''), '')::int
      else 0 end
  ), 0) into next_n from public.warp_pipes;

  for r in
    select variety_name, quantity_pcs, is_filled
    from public.beam_pipe_stock
    where quantity_pcs > 0
  loop
    for i in 1..least(r.quantity_pcs, 50) loop
      next_n := next_n + 1;
      pno := 'BP-' || lpad(next_n::text, 3, '0');
      insert into public.warp_pipes (
        pipe_no, serial_no, location, status, yarn_quality, remarks
      ) values (
        pno, pno, 'Godown',
        case when coalesce(r.is_filled, false) then 'FILLED_GODOWN' else 'EMPTY' end,
        r.variety_name,
        'Seeded from beam_pipe_stock · ' || r.variety_name
      )
      on conflict (pipe_no) do nothing;
    end loop;
  end loop;
end $$;

-- RLS + grants
alter table public.warp_pipes enable row level security;
alter table public.warp_yarn_transactions enable row level security;
alter table public.warp_yarn_purchases enable row level security;
alter table public.warp_warper_jobs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'warp_pipes', 'warp_yarn_transactions', 'warp_yarn_purchases', 'warp_warper_jobs'
  ]
  loop
    execute format('drop policy if exists %I on public.%I', t || '_authenticated_all', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_authenticated_all', t
    );
    execute format('grant all on table public.%I to anon, authenticated, service_role', t);
  end loop;
end $$;
