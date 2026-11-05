-- Step 3a: the privacy rules on every plan record (ARCHITECTURE.md 3.6).
--
-- Every table starts with everything refused, and these rules open only what
-- each person may have:
--
-- - Read a row only while their sign-in session exists (D21), while they're a
--   current member of the plan, and only if the row is shared or private to
--   them. Jess's private account and everything on it is never sent to Tom.
-- - Change a row only if, as well, it's private to them, or it's shared and
--   they can edit the plan (owner or editor). "Can view only" changes nothing
--   shared, ticks included (D51, D292).
-- - Never change a row locked to someone else, such as "From Jess" (D16, D293).
-- - Never delete a row. Removing one marks it deleted, which is a change like
--   any other, so the same rules apply (ARCHITECTURE.md 3.1).
--
-- Someone who isn't signed in can't use any table at all.

do $$
declare
  t text;
  locked boolean;
  can_change text;
begin
  foreach t in array app.record_tables() loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated, public', t);
    execute format('grant select, insert, update on public.%I to authenticated', t);

    execute format($rule$
      create policy read on public.%I for select to authenticated
      using (
        plan_id in (select app.my_plans())
        and (private_to is null or private_to = (select auth.uid()))
      )$rule$, t);

    locked := t in ('series', 'payment_changes', 'ticks');
    can_change := format($rule$
        plan_id in (select app.my_plans())
        and (
          private_to = (select auth.uid())
          or (private_to is null and plan_id in (select app.my_edit_plans()))
        )%s$rule$,
      case when locked then $lock$
        and (locked_to is null or locked_to = (select auth.uid()))$lock$ else '' end);

    execute format('create policy add on public.%I for insert to authenticated with check (%s)',
      t, can_change);
    execute format('create policy change on public.%I for update to authenticated using (%s) with check (%s)',
      t, can_change, can_change);
  end loop;
end;
$$;

-- History and notices are written by the server's own steps from step 3c on.
-- Until then nobody can write them, and each person reads only their own and
-- the plan's shared ones.

alter table public.edits enable row level security;
alter table public.notices enable row level security;
revoke all on public.edits, public.notices from anon, authenticated, public;

grant select on public.edits to authenticated;
create policy read on public.edits for select to authenticated
  using (
    plan_id in (select app.my_plans())
    and (private_to is null or private_to = (select auth.uid()))
  );

grant select on public.notices to authenticated;
grant update (read_at) on public.notices to authenticated;
create policy read on public.notices for select to authenticated
  using (plan_id in (select app.my_plans()) and for_person = (select auth.uid()));
create policy mark_read on public.notices for update to authenticated
  using (plan_id in (select app.my_plans()) and for_person = (select auth.uid()))
  with check (for_person = (select auth.uid()));

-- The plan's change counter is the database's own.
alter table app.plan_counters enable row level security;
revoke all on app.plan_counters from anon, authenticated, public;

-- ---------------------------------------------------------------------------
-- Who can use which function. Postgres lets everyone run a new function
-- unless it's taken back, and a schema's own default can't take that back,
-- so every function in `app` is taken back here and only the checks the
-- privacy rules call are given to signed-in people. The triggers run without
-- anyone needing to be able to call them. A later migration that adds a
-- function to `app` ends the same way (00-every-table.test.sql checks it).
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.refuse(text, text), app.from_a_person(),
  app.check_chosen_privacy(uuid, uuid, text, uuid), app.check_link(uuid, boolean, uuid),
  app.account_privacy(uuid)
  to authenticated;
