-- Step 3b: someone with "Can view only" can still add and change their own
-- pay, and overtime and missed shifts on it, even when the pay goes into a
-- shared account (the owner's answer, D311). Only their own pay: nothing else
-- shared. Adds to D51, D292 and D303.
--
-- Their own pay is money coming in that says it's theirs (`paid_to`, which
-- only they can set, D303), with nothing else shared hanging on it: no money
-- set aside into another account, and no savings goal. With it go its
-- one-off changes (the real amount, a moved date, skipping a payday) and its
-- ticks ("Mark as arrived"), and the change overtime or a missed shift makes
-- to it, which is locked to them (D303). Its job link and the overtime's
-- details are private to them already, which "Can view only" never limited.

-- The shared pay series in the person's plans that are their own pay. It runs
-- as the person, under the privacy rules, so it never says anything about
-- anyone else's.
create function app.my_own_pay() returns setof uuid
language sql stable set search_path = '' as $$
  select s.id from public.series s
  where s.paid_to = (select auth.uid()) and s.private_to is null and s.direction = 'in'
    and s.set_aside_account_id is null and s.goal_id is null
$$;

-- A series: shared and changed by an owner or editor as before, or the
-- person's own pay, whatever their role.
drop policy add on public.series;
drop policy change on public.series;
create policy add on public.series for insert to authenticated
  with check (
    plan_id in (select app.my_plans())
    and (
      private_to = (select auth.uid())
      or (private_to is null and (
        plan_id in (select app.my_edit_plans())
        or (paid_to = (select auth.uid()) and direction = 'in'
          and set_aside_account_id is null and goal_id is null)))
    )
    and (locked_to is null or locked_to = (select auth.uid()))
  );
create policy change on public.series for update to authenticated
  using (
    plan_id in (select app.my_plans())
    and (
      private_to = (select auth.uid())
      or (private_to is null and (
        plan_id in (select app.my_edit_plans())
        or (paid_to = (select auth.uid()) and direction = 'in'
          and set_aside_account_id is null and goal_id is null)))
    )
    and (locked_to is null or locked_to = (select auth.uid()))
  )
  with check (
    plan_id in (select app.my_plans())
    and (
      private_to = (select auth.uid())
      or (private_to is null and (
        plan_id in (select app.my_edit_plans())
        or (paid_to = (select auth.uid()) and direction = 'in'
          and set_aside_account_id is null and goal_id is null)))
    )
    and (locked_to is null or locked_to = (select auth.uid()))
  );

-- One-off changes and ticks: as before, or on the person's own pay.
do $$
declare
  t text;
  rule text := $rule$
    plan_id in (select app.my_plans())
    and (
      private_to = (select auth.uid())
      or (private_to is null and (
        plan_id in (select app.my_edit_plans())
        or series_id in (select app.my_own_pay())))
    )
    and (locked_to is null or locked_to = (select auth.uid()))$rule$;
begin
  foreach t in array array['payment_changes', 'ticks'] loop
    execute format('drop policy add on public.%I', t);
    execute format('drop policy change on public.%I', t);
    execute format('create policy add on public.%I for insert to authenticated with check (%s)', t, rule);
    execute format('create policy change on public.%I for update to authenticated using (%s) with check (%s)',
      t, rule, rule);
  end loop;
end;
$$;

-- Overtime and missed shifts: as before, or on the person's own shared pay,
-- whose change is locked to them (D303).
drop policy add on public.pay_adjustments;
drop policy change on public.pay_adjustments;
create policy add on public.pay_adjustments for insert to authenticated
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and (plan_id in (select app.my_edit_plans())
        or locked_to = (select auth.uid()))))
    and (locked_to is null or locked_to = (select auth.uid()))
  );
create policy change on public.pay_adjustments for update to authenticated
  using (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and (plan_id in (select app.my_edit_plans())
        or locked_to = (select auth.uid()))))
    and (locked_to is null or locked_to = (select auth.uid()))
  )
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and (plan_id in (select app.my_edit_plans())
        or locked_to = (select auth.uid()))))
    and (locked_to is null or locked_to = (select auth.uid()))
  );

-- Who can use which function, as at the end of step 3a (00-every-table.test.sql).
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.my_own_pay(), app.refuse(text, text),
  app.from_a_person(), app.check_chosen_privacy(uuid, uuid, text, uuid, uuid),
  app.check_link(uuid, boolean, uuid), app.account_privacy(uuid, uuid),
  app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  to authenticated;
