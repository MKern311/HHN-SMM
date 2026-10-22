-- SOSTAC® tool: keep the version history small (run after 01_history.sql)
-- Per group code the history keeps every version of the last 30 days and, in
-- any case, the newest 300 versions. Older versions are removed whenever the
-- plan is saved. Saving itself is never blocked (errors only log a warning).

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

    delete from public.sostac_plans_history h
     where h.group_id = old.group_id
       and h.changed_at < now() - interval '30 days'
       and h.hist_id not in (select k.hist_id from public.sostac_plans_history k
                              where k.group_id = old.group_id
                              order by k.changed_at desc limit 300);
  exception when others then
    raise warning 'sostac_plans_history: could not keep old version (%): %', tg_op, sqlerrm;
  end;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.sostac_plans_keep_history() from public, anon, authenticated;

-- Size check:
-- select group_id, count(*), pg_size_pretty(sum(pg_column_size(data))) from public.sostac_plans_history group by 1 order by 2 desc;
-- Rollback: run the function definition from 01_history.sql again.
