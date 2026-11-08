-- Step 3c fix (D351, D352): a person owns one plan at most.
--
-- Two phones that each found the account empty could both send their own
-- plan up as its first copy, leaving one account with two plans of its own,
-- each phone keeping a different one in step. Now the database refuses a
-- second plan for the same owner ("has-a-plan"), and two phones asking at
-- the same moment are taken one at a time, so only one of them gets it. The
-- other phone then asks the person which plan to keep (D324).
--
-- An account that already has two plans keeps both until the person chooses:
-- nothing is removed by itself. The next phone signed in to it asks "Choose
-- which plan to keep", and the one not kept is removed with remove_plan.
--
-- Nothing here ever puts an amount, a name or an email address into a
-- refusal: only a short code (D87, CLAUDE.md).

-- Runs after `before_write` (triggers run in the order of their names), so
-- the plan's owner has been filled in from who's asking.
create function app.one_plan_each() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- One at a time for each person: a second request waits here until the
  -- first has finished, and then sees the plan it made.
  perform 1 from public.people p where p.id = new.owner for update;
  if exists (select 1 from public.plans p where p.owner = new.owner and p.id <> new.id) then
    perform app.refuse('has-a-plan');
  end if;
  return new;
end;
$$;

-- A plan's owner never changes after it's made (`before_write`, "fixed-field"),
-- so a new plan is the only way to a second one.
create trigger one_plan_each before insert on public.plans
  for each row execute function app.one_plan_each();

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of every migration that adds to
-- `app` (00-every-table.test.sql): everything taken back, then only what the
-- rules and these steps call given to signed-in people.

revoke execute on all functions in schema app from public, anon, authenticated;
revoke execute on function public.save_edit(uuid, uuid, text, text, jsonb),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  from public, anon;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.my_own_pay(), app.refuse(text, text),
  app.from_a_person(), app.check_chosen_privacy(uuid, uuid, text, uuid, uuid),
  app.check_link(uuid, boolean, uuid), app.account_privacy(uuid, uuid),
  app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid),
  app.record_tables(), app.begin_edit(uuid, uuid, text, text), app.nudge(uuid, boolean),
  app.send_nudge(text), app.family_rules_problem(uuid, uuid[]), app.sent_columns(text), app.may_hear(text)
  to authenticated;
grant execute on function public.save_edit(uuid, uuid, text, text, jsonb),
  public.plan_changes(uuid, bigint, bigint), public.start_plan(uuid, text), public.remove_plan(uuid)
  to authenticated;
