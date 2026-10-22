-- SOSTAC® tool: small hardening without any change for the tool or the connector
-- (run in the Supabase SQL editor after 01_history.sql)

begin;

-- 1. Rights the REST API never uses
revoke truncate, references, trigger on table public.sostac_plans from anon, authenticated;

-- 2. A group code can no longer be renamed (a renamed code would make a plan
--    disappear for its group). The tool and the connector always send the
--    same group_id, so their saves are not affected.
create or replace function public.sostac_plans_keep_code()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is distinct from old.group_id or new.id is distinct from old.id then
    raise exception 'The group code of a plan cannot be changed.';
  end if;
  return new;
end;
$$;

revoke all on function public.sostac_plans_keep_code() from public, anon, authenticated;

create trigger sostac_plans_keep_code
  before update on public.sostac_plans
  for each row execute function public.sostac_plans_keep_code();

commit;

-- Rollback:
-- drop trigger if exists sostac_plans_keep_code on public.sostac_plans;
-- drop function if exists public.sostac_plans_keep_code();
-- grant truncate, references, trigger on table public.sostac_plans to anon, authenticated;
