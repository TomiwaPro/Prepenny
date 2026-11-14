-- Step 4a: the owner's two answers from step 3i (D508, D509), with the
-- details settled on 14 Nov 2026 (D512 to D514).
--
-- 1. In a shared plan, a budget's weeks and months follow the main pay of the
--    person who added it, on every phone, so Jess and Tom always see the same
--    balance in their joint account (D508). Each budget says whose that is.
-- 2. The other person's phone gets those paydays, the dates only: when the
--    pay comes, which paydays were moved and which removed, never its amount,
--    name, account or job (D512). The database works them out itself from the
--    pay, keeps them up to date whoever changes what, and only while a shared
--    budget follows them. No phone can write them.
-- 3. When the person who added a shared budget leaves, or deletes their
--    account, which leaves first (D482), it follows the payday of the person
--    who stays (D513).
-- 4. GraphQL, which PrePenny never uses, is switched off (D509), as
--    Supabase's own guide to pg_graphql says: "drop extension if exists
--    pg_graphql". The Database workflow checks it stays off on every run.
--
-- Checks: supabase/tests/database/33-shared-budget-paydays.test.sql.

-- ---------------------------------------------------------------------------
-- 1. Whose paydays a budget follows (D508): the person who added it. The
-- database fills it in, whatever a phone sends, and it never changes, except
-- when that person leaves (D513), or is forgotten (D482).

alter table public.budgets add column follows_pay_of uuid references public.people (id);
-- Set when the person who added it left, and it was passed on to the person
-- who stays (D513): their phone says so on the budget.
alter table public.budgets add column passed_on boolean not null default false;

comment on column public.budgets.follows_pay_of is
  'Whose main pay its weeks and months follow (D508): the person who added it, or the person who stays once they leave (D513).';
comment on column public.budgets.passed_on is
  'Passed on to the person who stays when the person who added it left (D513).';

create function app.budget_follows() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    -- The person adding it, as save_edit, joining, leaving with a copy and
    -- importing all add records as the person.
    if auth.uid() is not null then
      new.follows_pay_of := auth.uid();
      new.passed_on := false;
    end if;
  elsif auth.uid() is not null and app.leaving_now() is null and app.forgetting() is null then
    new.follows_pay_of := old.follows_pay_of;
    new.passed_on := old.passed_on;
  end if;
  return new;
end;
$$;

create trigger a1_follows before insert or update on public.budgets
  for each row execute function app.budget_follows();

-- Every budget there is already: the person who added it, while they're in
-- its plan, or, for one on a private account, that account's person; for
-- one whose person has left, the plan's owner, who stayed (D513). Each gets a
-- new change number, so every phone brings it down again; nothing else about
-- it changes, its version and who changed it last included, so a change
-- waiting on a phone still goes as it is.
alter table public.budgets disable trigger user;
update public.budgets b
  set follows_pay_of = case
      when b.private_to is not null then b.private_to
      when b.created_by is not null and exists (select 1 from public.plan_members m
        where m.plan_id = b.plan_id and m.person_id = b.created_by and m.left_at is null) then b.created_by
      else (select p.owner from public.plans p where p.id = b.plan_id)
    end,
    passed_on = b.private_to is null and not (b.created_by is not null and exists (select 1
      from public.plan_members m
      where m.plan_id = b.plan_id and m.person_id = b.created_by and m.left_at is null)),
    seq = app.next_seq(b.plan_id, b.private_to);
alter table public.budgets enable trigger user;

-- ---------------------------------------------------------------------------
-- 2. The paydays a shared budget follows, the dates only (D512). One row for
-- each series of a person's main pay, while a shared budget in the plan
-- follows their pay: when it starts, how often it comes, when it ends, its
-- weekend and bank holiday rule and where it carries on a split from, and
-- the paydays moved and removed. Nothing else: never the amount, the name,
-- the account or the job, and no id of the pay itself. Everyone in the plan
-- reads them. Only the database writes them. A row no longer wanted keeps
-- its id and change number, with nothing in it, so every phone takes it off.

create table public.paydays (
  -- Worked out from the plan and the pay's own id, which it never shows.
  id uuid primary key,
  plan_id uuid not null references public.plans (id) on delete cascade,
  version integer not null default 1,
  -- A shared record's change number: phones ask for everything after theirs.
  seq bigint not null default 0,
  changed_at timestamptz not null default now(),
  deleted boolean not null default false,
  -- Whose paydays: the person a budget's follows_pay_of names.
  person uuid references public.people (id) on delete cascade,
  start_date date,
  schedule jsonb check (schedule is null or schedule ->> 'kind' in ('once', 'weekly', 'monthly', 'dates', 'irregular')),
  end_rule jsonb check (end_rule is null or end_rule ->> 'kind' in ('never', 'after', 'on')),
  holiday_rule text check (holiday_rule in ('keep', 'working-day-before', 'working-day-after')),
  first_number integer check (first_number between 0 and 100000),
  -- Paydays moved: moved_from[i], the date from the schedule, to moved_to[i].
  moved_from date[],
  moved_to date[],
  -- Paydays removed, by their date from the schedule: they aren't paydays (D81).
  skipped date[],
  check (deleted or (person is not null and start_date is not null and schedule is not null
    and end_rule is not null and holiday_rule is not null and moved_from is not null
    and moved_to is not null and skipped is not null
    and cardinality(moved_from) = cardinality(moved_to))),
  check (not deleted or num_nonnulls(person, start_date, schedule, end_rule, holiday_rule,
    first_number, moved_from, moved_to, skipped) = 0)
);

create index paydays_by_plan on public.paydays (plan_id, seq);
create index paydays_by_person on public.paydays (plan_id, person);

comment on table public.paydays is
  'The paydays a shared budget follows, the dates only (D508, D512). Written by the database alone.';

alter table public.paydays enable row level security;
revoke all on public.paydays from anon, authenticated, public;
grant select on public.paydays to authenticated;
-- Everyone in the plan, while their sign-in session exists (app.my_plans).
create policy read on public.paydays for select to authenticated
  using (plan_id in (select app.my_plans()));

-- A series' schedule with only what says when it comes (ARCHITECTURE.md 3.3).
create function app.payday_schedule(schedule jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'kind', schedule -> 'kind',
    'every', schedule -> 'every',
    'on', case when jsonb_typeof(schedule -> 'on') = 'object' then jsonb_strip_nulls(jsonb_build_object(
        'kind', schedule -> 'on' -> 'kind',
        'day', schedule -> 'on' -> 'day',
        'weekday', schedule -> 'on' -> 'weekday',
        'position', schedule -> 'on' -> 'position')) end,
    'leaveOut', schedule -> 'leaveOut',
    'dates', schedule -> 'dates'))
$$;

-- An end rule with only what says when it ends.
create function app.payday_end(end_rule jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'kind', end_rule -> 'kind',
    'payments', end_rule -> 'payments',
    'date', end_rule -> 'date'))
$$;

-- Works out a person's paydays in a plan again, and saves only what
-- changed, each with a new change number, then nudges the plan's phones.
-- Wanted while they're in the plan, have a main pay, and a shared budget
-- there follows its paydays (D508, D512): a weekly one when the pay comes
-- every week or every few weeks, a monthly one when it comes every month
-- (D29, D108). Not for a pay-later card, which follows its bill, nor for
-- irregular pay, whose budgets run Monday to Sunday (D14). The phone tells
-- the person adding such a budget first (D514), by the same rule.
create function app.refresh_paydays(plan uuid, person uuid) returns void
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  family uuid;
  one record;
  row_id uuid;
  kept uuid[] := '{}'::uuid[];
  was public.paydays;
  changed boolean := false;
begin
  if plan is null or person is null then
    return;
  end if;
  if exists (select 1 from public.plan_members m
      where m.plan_id = plan and m.person_id = person and m.left_at is null) then
    select s.main_pay_family_id into family from public.settings s
      where s.plan_id = plan and s.private_to = person and not s.deleted;
  end if;
  if family is not null and (
      exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and not s.deleted
          and s.schedule ->> 'kind' = 'irregular')
      or not exists (select 1 from public.budgets b
        where b.plan_id = plan and b.private_to is null and not b.deleted
          and b.follows_pay_of = person and b.leaves <> 'pay-later'
          and exists (select 1 from public.series s
            where s.plan_id = plan and s.family_id = family and not s.deleted
              and ((b.every = 'week' and s.schedule ->> 'kind' = 'weekly')
                or (b.every = 'month' and s.schedule ->> 'kind' = 'monthly'
                  and s.schedule ->> 'every' = '1'))))) then
    family := null;
  end if;
  if family is not null then
    for one in
      select s.id, s.start_date, app.payday_schedule(s.schedule) as schedule,
        app.payday_end(s.end_rule) as end_rule, s.holiday_rule, s.first_number,
        coalesce(array_agg(c.original_date order by c.original_date)
          filter (where c.new_date is not null), '{}'::date[]) as moved_from,
        coalesce(array_agg(c.new_date order by c.original_date)
          filter (where c.new_date is not null), '{}'::date[]) as moved_to,
        coalesce(array_agg(c.original_date order by c.original_date)
          filter (where c.skipped is true), '{}'::date[]) as skipped
      from public.series s
      left join public.payment_changes c
        on c.series_id = s.id and c.plan_id = s.plan_id and not c.deleted
          and (c.new_date is not null or c.skipped is true)
      where s.plan_id = plan and s.family_id = family and not s.deleted
      group by s.id
    loop
      row_id := app.derived_id(plan, 'paydays', one.id::text);
      kept := kept || row_id;
      select * into was from public.paydays p where p.id = row_id for update;
      if not found then
        insert into public.paydays (id, plan_id, seq, person, start_date, schedule, end_rule,
            holiday_rule, first_number, moved_from, moved_to, skipped)
          values (row_id, plan, app.next_seq(plan, null), person, one.start_date, one.schedule,
            one.end_rule, one.holiday_rule, one.first_number, one.moved_from, one.moved_to, one.skipped);
        changed := true;
      elsif was.deleted or (was.person, was.start_date, was.schedule, was.end_rule, was.holiday_rule,
          was.first_number, was.moved_from, was.moved_to, was.skipped)
        is distinct from (person, one.start_date, one.schedule, one.end_rule, one.holiday_rule,
          one.first_number, one.moved_from, one.moved_to, one.skipped) then
        update public.paydays p set deleted = false, person = person, start_date = one.start_date,
            schedule = one.schedule, end_rule = one.end_rule, holiday_rule = one.holiday_rule,
            first_number = one.first_number, moved_from = one.moved_from, moved_to = one.moved_to,
            skipped = one.skipped, version = p.version + 1, seq = app.next_seq(plan, null),
            changed_at = now()
          where p.id = row_id;
        changed := true;
      end if;
    end loop;
  end if;
  -- Those no longer wanted: nothing left in them.
  update public.paydays p set deleted = true, person = null, start_date = null, schedule = null,
      end_rule = null, holiday_rule = null, first_number = null, moved_from = null, moved_to = null,
      skipped = null, version = p.version + 1, seq = app.next_seq(plan, null), changed_at = now()
    where p.plan_id = plan and p.person = person and not p.deleted and p.id <> all (kept);
  if found then
    changed := true;
  end if;
  if changed then
    perform app.send_nudge('plan:' || plan);
  end if;
end;
$$;

-- After any change to what a person's paydays come from: the budgets that
-- follow them, their settings (their main pay), their membership, their
-- main pay's series and its one-off changes. Each change works out again
-- only the paydays of the people it's about.
create function app.paydays_follow() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rows jsonb[] := array_remove(array[to_jsonb(old), to_jsonb(new)], null);
  one jsonb;
  pair record;
begin
  for pair in
    select distinct x.plan, x.person from (
      select (r ->> 'plan_id')::uuid as plan,
        case tg_table_name
          when 'budgets' then (r ->> 'follows_pay_of')::uuid
          when 'settings' then (r ->> 'private_to')::uuid
          when 'plan_members' then (r ->> 'person_id')::uuid
        end as person
      from unnest(rows) r
      where tg_table_name in ('budgets', 'settings', 'plan_members')
      union all
      select (r ->> 'plan_id')::uuid, s.private_to
      from unnest(rows) r
      join public.settings s on s.plan_id = (r ->> 'plan_id')::uuid and not s.deleted
        and s.main_pay_family_id = (r ->> 'family_id')::uuid
      where tg_table_name = 'series'
      union all
      select (r ->> 'plan_id')::uuid, s.private_to
      from unnest(rows) r
      join public.series f on f.id = (r ->> 'series_id')::uuid
      join public.settings s on s.plan_id = f.plan_id and not s.deleted
        and s.main_pay_family_id = f.family_id
      where tg_table_name = 'payment_changes'
    ) x
    where x.plan is not null and x.person is not null
  loop
    perform app.refresh_paydays(pair.plan, pair.person);
  end loop;
  return null;
end;
$$;

create trigger z_paydays after insert or update or delete on public.budgets
  for each row execute function app.paydays_follow();
create trigger z_paydays after insert or update or delete on public.settings
  for each row execute function app.paydays_follow();
create trigger z_paydays after insert or update or delete on public.plan_members
  for each row execute function app.paydays_follow();
create trigger z_paydays after insert or update or delete on public.series
  for each row execute function app.paydays_follow();
create trigger z_paydays after insert or update or delete on public.payment_changes
  for each row execute function app.paydays_follow();

revoke all on function app.budget_follows(), app.payday_schedule(jsonb), app.payday_end(jsonb),
  app.refresh_paydays(uuid, uuid), app.paydays_follow() from public, anon, authenticated;

-- The paydays of every budget there is already.
do $$
declare
  pair record;
begin
  for pair in select distinct b.plan_id, b.follows_pay_of from public.budgets b
      where b.private_to is null and not b.deleted and b.follows_pay_of is not null loop
    perform app.refresh_paydays(pair.plan_id, pair.follows_pay_of);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Leaving (D468, D473), as step 3g made it, with one more line: a shared
-- budget the leaver added follows the payday of the person who stays (D513).
-- Their paydays then go from the plan by themselves (part 2).

-- "Leave this plan" (D468): any current member, whatever their role, while
-- someone else is in it ("alone" otherwise: a plan of one's own isn't left).
-- `new_plan` is the id of the leaver's new plan, made on their phone, as a
-- plan's id always is. `keep_copy`: whether it also gets every shared record
-- as it is now, which never updates. A goal of their own that saves into a
-- shared account always brings a copy of that account (D472). Sent twice,
-- it changes nothing the second time. One step: all of it, or nothing. Only
-- the copy can fail on its own (a shared record the checks no longer take),
-- and then they leave with their own things only ("copied": false).
-- Refusals: "not-found" (42501), "alone", "bad-edit", "bad-record",
-- "family-broken".
create or replace function public.leave_plan(plan uuid, keep_copy boolean, new_plan uuid, edit uuid, made_at text)
returns jsonb
language plpgsql volatile security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  me uuid := auth.uid();
  old_plan public.plans;
  other uuid;
  new_edit uuid;
  t text;
  got jsonb;
  mine jsonb := '{}'::jsonb;
  everything jsonb := '{}'::jsonb;
  least jsonb := '{}'::jsonb;
  folds jsonb;
  family_debt jsonb := '{}'::jsonb;
  family_goal jsonb := '{}'::jsonb;
  jobs jsonb := '{}'::jsonb;
  tick_debt jsonb := '{}'::jsonb;
  link jsonb;
  gone text[] := '{}'::text[];
  families uuid[];
  copied boolean := false;
begin
  if plan is null or new_plan is null or edit is null or keep_copy is null or not app.session_ok() then
    perform app.refuse('not-found', '42501');
  end if;
  perform app.check_made_at(made_at);
  -- One at a time for this person, as making or joining a plan is (D352).
  perform 1 from public.people p where p.id = me for update;
  -- Sent again after it worked: nothing changes.
  if exists (select 1 from public.plans p where p.id = new_plan and p.owner = me)
    and exists (select 1 from public.plan_members m
      where m.plan_id = plan and m.person_id = me and m.left_at is not null) then
    return jsonb_build_object('saved', 'already', 'plan', new_plan,
      'copied', (select (e.summary ->> 'copied')::boolean from public.edits e
        where e.id = app.derived_id(new_plan, 'leave', edit::text)),
      'now', app.server_time());
  end if;
  if not exists (select 1 from app.my_plans() p where p = plan)
    or exists (select 1 from public.plans p where p.id = new_plan) then
    perform app.refuse('not-found', '42501');
  end if;
  -- Every save to the plan waits until this is done.
  select * into old_plan from public.plans p where p.id = plan for update;
  select m.person_id into other from public.plan_members m
    where m.plan_id = plan and m.left_at is null and m.person_id <> me order by m.joined_at limit 1;
  if other is null then
    perform app.refuse('alone');
  end if;

  -- 1. What goes with them: everything private to them, live and removed.
  -- For a copy, every shared record as it is now: live ones, and every row
  -- of a payment family that still has a live one. Either way, a shared
  -- account one of their own goals saves into, with its balances.
  for t in select unnest(app.leave_tables()) loop
    execute format(
      'select coalesce(jsonb_agg(to_jsonb(r) order by %s), ''[]''::jsonb) from public.%I r
        where r.plan_id = $1 and r.private_to = $2',
      case when t = 'series' then 'r.family_id, r.id <> r.family_id, coalesce(r.first_number, 0), r.id'
        else 'r.list_order, r.id' end, t) into got using plan, me;
    mine := mine || jsonb_build_object(t, got);
    if t not in ('pay_profiles', 'pay_weeks', 'pay_adjustment_details', 'settings') then
      if keep_copy then
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(r) order by %s), ''[]''::jsonb) from public.%I r
            where r.plan_id = $1 and r.private_to is null and %s',
          case when t = 'series' then 'r.family_id, r.id <> r.family_id, coalesce(r.first_number, 0), r.id'
            else 'r.list_order, r.id' end, t,
          case when t = 'series' then 'r.family_id in (select s.family_id from public.series s
              where s.plan_id = $1 and s.private_to is null and not s.deleted)'
            else 'not r.deleted' end) into got using plan;
        everything := everything || jsonb_build_object(t, got);
      end if;
      if t in ('accounts', 'balance_updates') then
        execute format(
          'select coalesce(jsonb_agg(to_jsonb(r) order by r.list_order, r.id), ''[]''::jsonb) from public.%I r
            where r.plan_id = $1 and r.private_to is null and not r.deleted
              and %s in (select g.account_id from public.goals g where g.plan_id = $1 and g.private_to = $2)',
          t, case when t = 'accounts' then 'r.id' else 'r.account_id' end) into got using plan, me;
        least := least || jsonb_build_object(t, got);
      end if;
    end if;
    select gone || coalesce(array_agg(t || ':' || (x ->> 'id')), '{}'::text[]) into gone
      from jsonb_array_elements(mine -> t) x;
  end loop;
  -- Their own links from shared payments to their own debts, goals and job
  -- (D291), by the shared record, to go back on the copies, which are theirs.
  for link in select to_jsonb(l) from public.private_links l
      where l.plan_id = plan and l.private_to = me and not l.deleted loop
    if link ->> 'family_id' is not null and link ->> 'debt_id' is not null then
      family_debt := family_debt || jsonb_build_object(link ->> 'family_id', link -> 'debt_id');
    elsif link ->> 'family_id' is not null and link ->> 'goal_id' is not null then
      family_goal := family_goal || jsonb_build_object(link ->> 'family_id', link -> 'goal_id');
    elsif link ->> 'series_id' is not null then
      jobs := jobs || jsonb_build_object(link ->> 'series_id', link);
    elsif link ->> 'tick_id' is not null then
      tick_debt := tick_debt || jsonb_build_object(link ->> 'tick_id', link -> 'in_debt_update');
    end if;
  end loop;
  folds := jsonb_build_object('family_debt', family_debt, 'family_goal', family_goal,
    'jobs', jobs, 'tick_debt', tick_debt);

  -- 2. The shared plan, in an edit of its own, which the other person sees
  -- in Activity ("Tom left the plan"). Money kept as theirs ("From Tom") and
  -- their pay in shared accounts become the other person's to change, as
  -- they are (D468).
  if app.begin_edit(plan, edit, made_at, 'leave') = 'already' then
    perform app.refuse('not-found', '42501');
  end if;
  perform set_config('prepenny.edit', edit::text, true);
  perform set_config('prepenny.leaving', me::text, true);
  begin
    update public.series s set locked_to = null
      where s.plan_id = plan and s.private_to is null and s.locked_to = me;
    update public.series s set paid_to = null
      where s.plan_id = plan and s.private_to is null and s.paid_to = me;
    update public.payment_changes c set deleted = c.deleted
      where c.plan_id = plan and c.private_to is null and c.locked_to = me;
    update public.ticks k set deleted = k.deleted
      where k.plan_id = plan and k.private_to is null and k.locked_to = me;
    update public.pay_adjustments a set deleted = a.deleted
      where a.plan_id = plan and a.private_to is null and a.locked_to = me;
    -- Step 4a (D513): a shared budget they added follows the payday of the
    -- person who stays from now on, or the 1st of the month if they have
    -- no main pay, on every phone.
    update public.budgets b set follows_pay_of = other, passed_on = true
      where b.plan_id = plan and b.private_to is null and b.follows_pay_of = me;
  exception
    when sqlstate 'P0001' or insufficient_privilege then
      raise;
    when others then
      perform app.refuse('bad-record');
  end;
  perform set_config('prepenny.edit', '', true);
  update public.edits e set private_to = null, summary = jsonb_build_object('person', me) where e.id = edit;

  -- Nothing private of theirs stays: every record private to them goes from
  -- the shared plan (it's in `mine`, for the new one), with their notices,
  -- and every copy of theirs in the history of changes that stay, and every
  -- copy at all of a record that goes. Their own changes go with them.
  for t in select unnest(array['private_links', 'pay_adjustment_details', 'settings', 'pay_adjustments', 'spends',
      'ticks', 'payment_changes', 'series', 'balance_updates', 'budgets', 'goals', 'pay_weeks',
      'pay_profiles', 'debts', 'accounts']) loop
    execute format('delete from public.%I where plan_id = $1 and private_to = $2', t) using plan, me;
  end loop;
  delete from public.notices n where n.plan_id = plan and n.for_person = me;
  delete from app.edit_records r
    where r.plan_id = plan
      and (r.after_private = me or (r.record_table || ':' || r.record_id) = any (gone))
      and not exists (select 1 from public.edits e where e.id = r.edit_id and e.private_to = me);
  update app.edit_records r set before = null
    where r.plan_id = plan and r.before_private = me
      and not exists (select 1 from public.edits e where e.id = r.edit_id and e.private_to = me);

  -- They're no longer in it. The person who stays becomes the owner, when
  -- the owner leaves (D53), and any invite still open is cancelled.
  update public.plan_members m set left_at = now() where m.plan_id = plan and m.person_id = me;
  if old_plan.owner = me then
    update public.plan_members m set role = 'owner' where m.plan_id = plan and m.person_id = other;
    update public.plans p set owner = other where p.id = plan;
    update public.invites i set cancelled_at = now()
      where i.plan_id = plan and i.cancelled_at is null and i.accepted_at is null and i.refused_at is null;
  end if;

  -- 3. Their own plan, with the same bank holidays, and what goes with them.
  perform set_config('prepenny.starting', new_plan::text, true);
  insert into public.plans (id, nation) values (new_plan, old_plan.nation);
  perform set_config('prepenny.starting', '', true);
  new_edit := app.derived_id(new_plan, 'leave', edit::text);
  perform app.begin_edit(new_plan, new_edit, made_at, 'leave');
  perform set_config('prepenny.edit', new_edit::text, true);
  if keep_copy then
    begin
      families := app.leave_insert(new_plan, me, mine, everything, folds);
      if app.family_rules_problem(new_plan, families) is not null then
        raise exception 'family-broken';
      end if;
      copied := true;
    exception when others then
      -- The copy couldn't be made: they leave all the same, with their own.
      copied := false;
    end;
  end if;
  if not copied then
    begin
      families := app.leave_insert(new_plan, me, mine, least, folds);
    exception
      when sqlstate 'P0001' or insufficient_privilege then
        raise;
      when others then
        perform app.refuse('bad-record');
    end;
    if app.family_rules_problem(new_plan, families) is not null then
      perform app.refuse('family-broken');
    end if;
  end if;
  perform set_config('prepenny.edit', '', true);
  perform set_config('prepenny.leaving', '', true);
  update public.edits e set summary = jsonb_build_object('copied', copied) where e.id = new_edit;
  -- Their own history comes with them (D468).
  update public.edits e set plan_id = new_plan where e.plan_id = plan and e.private_to = me;
  update app.edit_records r set plan_id = new_plan
    where r.plan_id = plan and r.edit_id in (select e.id from public.edits e where e.plan_id = new_plan);

  perform app.send_nudge('plan:' || plan);
  perform app.send_nudge('plan:' || plan || ':' || me);
  perform app.send_nudge('plan:' || new_plan || ':' || me);
  return jsonb_build_object('saved', 'new', 'plan', new_plan, 'copied', copied, 'now', app.server_time());
end;
$$;
-- ---------------------------------------------------------------------------
-- 4. What's new since a phone last looked, as step 3i made it, with the
-- paydays a shared budget follows (part 2), and every record read at one
-- moment (D521). It read each kind of record in a query of its own, and each
-- query sees the newest the database has at its own moment. A change saved
-- between two of them, such as Jess's food month and the paydays saved with
-- it, came half: the paydays, read later, without the budget, read earlier.
-- The phone then counted past the budget's change number and never asked
-- for it again. Now one query reads them all, so a change comes whole or
-- not yet. The notices are still read first (D502).

create or replace function public.plan_changes(plan uuid, shared_after bigint, mine_after bigint)
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  all_rows jsonb;
  the_plan jsonb;
  found_notices jsonb;
  every_table text;
begin
  if plan is null or not exists (select 1 from app.my_plans() p where p = plan) then
    perform app.refuse('not-found', '42501');
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', n.id, 'edit', n.edit_id, 'data', n.data)
      order by n.created_at), '[]'::jsonb)
    into found_notices
    from public.notices n
    where n.plan_id = plan and n.for_person = auth.uid() and n.kind = 'clash' and n.read_at is null
      and n.created_at > now() - interval '30 days';
  select jsonb_build_object('id', p.id, 'nation', p.nation, 'owner', p.owner, 'version', p.version,
      'seq', p.seq, 'changed_at', p.changed_at, 'edit_id', p.edit_id,
      'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
      'edit_by', e.person_id, 'edit_kind', e.kind)
    into the_plan from public.plans p
    left join public.edits e on e.id = p.edit_id and e.plan_id = p.id
    where p.id = plan;
  -- Every kind of record, in the same order as before, then the paydays
  -- (shared, so they count with the shared records), in one query.
  select string_agg(format($q$
      select %s as kind_order, r.seq, jsonb_build_object('table', %L,
          'row', to_jsonb(r) - 'plan_id' - 'created_at',
          'edit_made_at', e.made_at, 'edit_saved_at', app.utc_exact(e.saved_at),
          'edit_by', e.person_id, 'edit_kind', e.kind) as one
      from public.%I r
      left join public.edits e on e.id = r.edit_id and e.plan_id = r.plan_id
      where r.plan_id = $1
        and ((r.private_to is null and r.seq > $2) or (r.private_to = auth.uid() and r.seq > $3))$q$,
      t.n, t.name, t.name), ' union all ' order by t.n)
    into every_table
    from unnest(app.record_tables()) with ordinality as t(name, n);
  execute format($q$
      select coalesce(jsonb_agg(x.one order by x.kind_order, x.seq), '[]'::jsonb) from (
        %s
        union all
        select 1000, r.seq, jsonb_build_object('table', 'paydays', 'row', to_jsonb(r) - 'plan_id')
        from public.paydays r
        where r.plan_id = $1 and r.seq > $2
      ) x$q$, every_table)
    into all_rows using plan, coalesce(shared_after, 0), coalesce(mine_after, 0);
  return jsonb_build_object('plan', the_plan, 'rows', all_rows,
    'members', (select coalesce(jsonb_agg(jsonb_build_object('person', m.person_id, 'role', m.role,
        'nickname', coalesce(p.nickname, ''))), '[]'::jsonb)
      from public.plan_members m left join public.people p on p.id = m.person_id
      where m.plan_id = plan and m.left_at is null),
    'notices', found_notices,
    'now', app.server_time());
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. GraphQL off (D509). PrePenny never uses it, so it's one door fewer into
-- the database. Supabase's guide to pg_graphql: "Disable the pg_graphql
-- extension: drop extension if exists pg_graphql;". Its own event trigger
-- then leaves GraphQL's address answering only that it isn't switched on.
-- The Database workflow runs this on every run, so if GraphQL is ever
-- switched on again, from Supabase's own pages for example, it's switched
-- off again and the run says so: 'switched-off', or 'off' when it was.
-- Nothing that isn't the database's own can run it.

create function app.keep_graphql_off() returns text
language plpgsql volatile set search_path = '' as $$
begin
  if exists (select 1 from pg_catalog.pg_extension e where e.extname = 'pg_graphql') then
    drop extension pg_graphql;
    return 'switched-off';
  end if;
  return 'off';
end;
$$;

revoke all on function app.keep_graphql_off() from public, anon, authenticated;

select app.keep_graphql_off();
