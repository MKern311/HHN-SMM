-- SOSTAC® tool: version history of every plan (run ONCE in the Supabase SQL editor)
-- Before: export sostac_plans as CSV (Table Editor › sostac_plans › Export › CSV).
-- Changes nothing in sostac_plans (no column, no policy, last_saved untouched):
-- the tool and the connector keep working exactly as before.

begin;

create table public.sostac_plans_history (
  hist_id     bigint generated always as identity primary key,
  plan_id     uuid        not null,                 -- sostac_plans.id of the old row
  group_id    text        not null,
  data        jsonb       not null,
  last_saved  timestamptz,                          -- value of the old row, unchanged
  changed_at  timestamptz not null default now(),   -- server time of the change
  op          text        not null check (op in ('UPDATE', 'DELETE', 'TRUNCATE'))
);

create index sostac_plans_history_group_changed_idx
  on public.sostac_plans_history (group_id, changed_at desc);

-- Students (anon, authenticated) get no access. Supabase's default privileges
-- in schema public would otherwise grant them everything on a new table.
alter table public.sostac_plans_history enable row level security;
revoke all on table public.sostac_plans_history from anon, authenticated;
-- deliberately NO policy

-- Row trigger: keep the old row before UPDATE/DELETE.
create or replace function public.sostac_plans_keep_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and new.data is not distinct from old.data
     and new.group_id is not distinct from old.group_id then
    return new;                 -- only last_saved changed: nothing to keep
  end if;

  begin
    insert into public.sostac_plans_history (plan_id, group_id, data, last_saved, op)
    values (old.id, old.group_id, old.data, old.last_saved, tg_op);
  exception when others then
    -- a failing history must never stop a save
    raise warning 'sostac_plans_history: could not keep old version (%): %', tg_op, sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Statement trigger: keep the whole table before TRUNCATE.
create or replace function public.sostac_plans_keep_history_truncate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.sostac_plans_history (plan_id, group_id, data, last_saved, op)
  select id, group_id, data, last_saved, 'TRUNCATE' from public.sostac_plans;
  return null;
end;
$$;

revoke all on function public.sostac_plans_keep_history() from public, anon, authenticated;
revoke all on function public.sostac_plans_keep_history_truncate() from public, anon, authenticated;

create trigger sostac_plans_history_row
  before update or delete on public.sostac_plans
  for each row execute function public.sostac_plans_keep_history();

create trigger sostac_plans_history_truncate
  before truncate on public.sostac_plans
  for each statement execute function public.sostac_plans_keep_history_truncate();

commit;

-- ── Check afterwards ──────────────────────────────────────────────────────
-- select tgname, tgenabled from pg_trigger
--  where tgrelid = 'public.sostac_plans'::regclass and not tgisinternal;      -- 2 rows, 'O'
-- select has_table_privilege('anon', 'public.sostac_plans_history', 'SELECT'); -- false
-- Press "Test connection" in the tool twice, then:
-- select op, changed_at from public.sostac_plans_history
--  where group_id = '__diag_test__' order by changed_at desc limit 5;

-- ── Restore an older version of one plan (only when needed) ───────────────
-- select hist_id, op, changed_at, last_saved, pg_column_size(data) as bytes
--   from public.sostac_plans_history where group_id = '<CODE>' order by changed_at desc;
-- update public.sostac_plans p set data = h.data, last_saved = now()
--   from public.sostac_plans_history h where h.hist_id = <HIST_ID> and p.id = h.plan_id;

-- ── Rollback ──────────────────────────────────────────────────────────────
-- drop trigger if exists sostac_plans_history_row on public.sostac_plans;
-- drop trigger if exists sostac_plans_history_truncate on public.sostac_plans;
-- drop function if exists public.sostac_plans_keep_history();
-- drop function if exists public.sostac_plans_keep_history_truncate();
-- (the table sostac_plans_history stays; export it before dropping it)
