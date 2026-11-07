-- Step 3b: the owner's answers to step 3a's questions (D301 to D303).
--
-- 1. What if's practice changes stay on the phone only (D264, D301), so their
--    table goes.
-- 2. "Can view only" still lets someone change their own private accounts and
--    everything on them (D302). Nothing changes here: that's how step 3a built it.
-- 3. Job details stay private to their person, even when their pay lands in a
--    shared account (D303). The partner sees the pay, and any change from
--    overtime or a missed shift, as amounts only: never the tax code, the
--    pension, a usual week, the hours or the rate. Only the person whose pay
--    it is can add overtime or a missed shift to it. A shared record never
--    has to name a private one (D291):
--    - a pay profile, and so its usual weeks, is always private to its person;
--    - a payment says whose pay it is (`paid_to`), set only by that person;
--    - pay in a shared account finds its job through a private link that only
--      its person reads, as a shared payment finds a private debt (D291);
--    - overtime is two records: the change to the payday, which everyone in
--      the plan reads and only its person can change, and its details, which
--      only its person reads.
--
-- Nothing is in these tables yet on the real database: nothing in the app
-- sends anything to it until step 3c.

-- ---------------------------------------------------------------------------
-- 1. Practice changes stay on the phone.

drop table public.practice_changes;

create or replace function app.record_tables() returns text[]
language sql immutable set search_path = '' as $$
  select array[
    'accounts', 'balance_updates', 'debts', 'pay_profiles', 'pay_weeks', 'goals',
    'budgets', 'series', 'payment_changes', 'ticks', 'spends', 'pay_adjustments',
    'pay_adjustment_details', 'settings', 'private_links'
  ]
$$;

-- ---------------------------------------------------------------------------
-- 3a. A pay profile is always private to the person it belongs to.

create function app.check_pay_profile() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if app.from_a_person() then
      new.private_to := auth.uid();
    end if;
  elsif new.private_to is distinct from old.private_to then
    perform app.refuse('fixed-field');
  end if;
  -- Whose job it is: always the person it's private to.
  new.belongs_to := new.private_to;
  return new;
end;
$$;

drop trigger a_privacy on public.pay_profiles;
create trigger a_privacy before insert or update on public.pay_profiles
  for each row execute function app.check_pay_profile();

alter table public.pay_profiles
  add constraint pay_profiles_always_private check (private_to is not null and belongs_to = private_to);

-- ---------------------------------------------------------------------------
-- 3b. Whose pay a payment is.

-- Set only by that person, or kept from the payment it was split from, so
-- "this and all later ones" by a partner keeps it theirs. Money coming in only.
alter table public.series
  add column paid_to uuid references public.people (id),
  add constraint series_paid_to_is_money_in check (paid_to is null or direction = 'in');

-- Whether a series fits the family it names (D49, D89): as in step 3a, with
-- whose pay it is too, so a split can't hand someone's pay to someone else.
drop function app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid);
create function app.family_problem(
  plan uuid, family uuid, self uuid, account uuid, private uuid, locked uuid, paid uuid, parent uuid
) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self)
      then case when family = self and parent is null then null else 'family-mixed' end
    when exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self
          and (s.account_id <> account or s.private_to is distinct from private
            or s.locked_to is distinct from locked or s.paid_to is distinct from paid))
      then 'family-mixed'
    when parent is null and family <> self
      then 'family-mixed'
    when parent is not null and not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id = parent)
      then 'family-mixed'
  end
$$;

-- A series: everything step 3a checks, and whose pay it is.
create or replace function app.check_series() returns trigger
language plpgsql set search_path = '' as $$
declare
  account record;
  other record;
  week uuid;
  problem text;
begin
  if tg_op = 'UPDATE' and (new.account_id <> old.account_id
    or new.to_account_id is distinct from old.to_account_id
    or new.family_id <> old.family_id
    or new.split_from is distinct from old.split_from
    or new.locked_to is distinct from old.locked_to
    or new.paid_to is distinct from old.paid_to) then
    perform app.refuse('fixed-field');
  end if;

  account := app.account_privacy(new.account_id, new.plan_id);
  if account.seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := account.private;

  -- Money moving between two accounts, or set aside into one, stays at one
  -- level of privacy. Between a private account and a shared one it's two
  -- linked halves instead (D16).
  if new.to_account_id is not null then
    other := app.account_privacy(new.to_account_id, new.plan_id);
    if other.seen is not true then
      perform app.refuse('not-found', '42501');
    end if;
    if other.private is distinct from new.private_to then
      perform app.refuse('private-transfer-needs-halves');
    end if;
  end if;
  if new.set_aside_account_id is not null then
    other := app.account_privacy(new.set_aside_account_id, new.plan_id);
    if other.seen is not true then
      perform app.refuse('not-found', '42501');
    end if;
    if other.private is distinct from new.private_to then
      perform app.refuse('private-transfer-needs-halves');
    end if;
  end if;

  if new.debt_id is not null then
    select true as seen, d.private_to as private into other from public.debts d where d.id = new.debt_id and d.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  if new.goal_id is not null then
    other := null;
    select true as seen, g.private_to as private into other from public.goals g where g.id = new.goal_id and g.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  -- A pay profile and its usual weeks are always private (D303), so only a
  -- payment private to the same person can name them. Pay in a shared
  -- account finds its job through a private link instead.
  if new.pay_profile_id is not null then
    other := null;
    select true as seen, p.private_to as private into other
      from public.pay_profiles p where p.id = new.pay_profile_id and p.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end if;
  foreach week in array coalesce(new.cycle_pay_weeks, '{}') loop
    other := null;
    select true as seen, w.private_to as private into other from public.pay_weeks w where w.id = week and w.plan_id = new.plan_id;
    perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
  end loop;

  -- Whose pay it is. On a private account, only its own person's. Nobody can
  -- say a payment is someone else's pay, except by splitting one that already
  -- is: the family check below keeps it the same across the family.
  if new.paid_to is not null then
    if new.private_to is not null and new.paid_to <> new.private_to then
      perform app.refuse('not-found', '42501');
    end if;
    if tg_op = 'INSERT' and app.from_a_person() and new.paid_to <> auth.uid() and new.split_from is null then
      perform app.refuse('not-found', '42501');
    end if;
  end if;

  -- A family is a series and the series split from it (D49): on one account,
  -- with one privacy, one lock and one person's pay.
  problem := app.family_problem(new.plan_id, new.family_id, new.id, new.account_id,
    new.private_to, new.locked_to, new.paid_to, new.split_from);
  if problem is not null then
    perform app.refuse(problem);
  end if;

  -- The shared half of a private transfer, "From Jess": on a shared account,
  -- locked to the person whose money it is, carrying only the date, the
  -- amount, how often and whether it's an estimate (D16, D94).
  if new.locked_to is not null then
    if new.private_to is not null then
      perform app.refuse('shared-half');
    end if;
    if tg_op = 'INSERT' and app.from_a_person() and new.locked_to <> auth.uid() then
      perform app.refuse('not-found', '42501');
    end if;
    if new.note is not null or new.debt_id is not null or new.goal_id is not null
      or new.pay_profile_id is not null or new.cycle_pay_weeks is not null
      or new.set_aside_account_id is not null or new.mirrored_by is not null
      or new.paid_to is not null then
      perform app.refuse('shared-half');
    end if;
  end if;

  -- The private half names the shared half that mirrors it, locked to the
  -- same person.
  if new.mirrored_by is not null then
    other := null;
    select true as seen, s.private_to as private, s.locked_to as locked into other
      from public.series s where s.id = new.mirrored_by and s.plan_id = new.plan_id;
    if not coalesce(other.seen, false) then
      perform app.refuse('not-found', '42501');
    end if;
    if new.private_to is null or other.private is not null or other.locked is distinct from new.private_to then
      perform app.refuse('shared-half');
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3c. The link from pay in a shared account to its person's job.

alter table public.private_links
  add column series_id uuid references public.series (id),
  add column pay_profile_id uuid references public.pay_profiles (id),
  -- The usual week for each step of the pay pattern (D5), as on a series.
  add column cycle_pay_weeks uuid[] check (cardinality(cycle_pay_weeks) between 1 and 8);

alter table public.private_links drop constraint private_links_check;
alter table public.private_links add constraint private_links_one_kind check (
  -- A shared payment's family: its debt or savings goal (D291).
  (family_id is not null and tick_id is null and in_debt_update is null and series_id is null
    and pay_profile_id is null and cycle_pay_weeks is null and num_nonnulls(debt_id, goal_id) = 1)
  -- A shared tick made inside a private debt's Update from statement (D62).
  or (tick_id is not null and family_id is null and debt_id is null and goal_id is null
    and in_debt_update is not null and series_id is null and pay_profile_id is null and cycle_pay_weeks is null)
  -- Pay in a shared account: its job, and the usual weeks (D303). Each
  -- series has its own, as a split can change the weeks (D136).
  or (series_id is not null and pay_profile_id is not null and family_id is null and tick_id is null
    and debt_id is null and goal_id is null and in_debt_update is null)
);

create unique index private_links_one_job_per_series on public.private_links (series_id)
  where series_id is not null and not deleted;

create or replace function app.check_private_link() returns trigger
language plpgsql set search_path = '' as $$
declare
  pay record;
  week uuid;
begin
  if tg_op = 'UPDATE' and (new.family_id is distinct from old.family_id
    or new.tick_id is distinct from old.tick_id or new.series_id is distinct from old.series_id) then
    perform app.refuse('fixed-field');
  end if;
  if (new.family_id is not null
      and not exists (select 1 from public.series s where s.family_id = new.family_id and s.plan_id = new.plan_id))
    or (new.tick_id is not null and not exists (select 1 from public.ticks t where t.id = new.tick_id and t.plan_id = new.plan_id))
    or (new.debt_id is not null and not exists (select 1 from public.debts d where d.id = new.debt_id and d.plan_id = new.plan_id))
    or (new.goal_id is not null and not exists (select 1 from public.goals g where g.id = new.goal_id and g.plan_id = new.plan_id))
    or (new.in_debt_update is not null
      and not exists (select 1 from public.debts d where d.id = new.in_debt_update and d.plan_id = new.plan_id))
    or (new.pay_profile_id is not null and not exists (select 1 from public.pay_profiles p
      where p.id = new.pay_profile_id and p.plan_id = new.plan_id)) then
    perform app.refuse('not-found', '42501');
  end if;
  if new.series_id is not null then
    -- Shared pay that's the person's own. Pay on their private account names
    -- its job itself.
    select true as seen, s.private_to as private, s.paid_to as paid into pay
      from public.series s where s.id = new.series_id and s.plan_id = new.plan_id;
    if not coalesce(pay.seen, false) then
      perform app.refuse('not-found', '42501');
    end if;
    if pay.private is not null then
      perform app.refuse('link-not-needed');
    end if;
    if pay.paid is distinct from new.private_to then
      perform app.refuse('not-your-pay');
    end if;
    foreach week in array coalesce(new.cycle_pay_weeks, '{}') loop
      if not exists (select 1 from public.pay_weeks w
          where w.id = week and w.plan_id = new.plan_id and w.pay_profile_id = new.pay_profile_id) then
        perform app.refuse('not-found', '42501');
      end if;
    end loop;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3d. Overtime and missed shifts: the change to the payday, and its details.

-- What everyone who reads the pay may read: which payday, and by how much.
-- Locked to the person whose pay it is, when the pay is shared.
alter table public.pay_adjustments
  drop column kind,
  drop column worked_on,
  drop column hours,
  drop column rate,
  drop column extras,
  drop column tax_year,
  add column locked_to uuid references public.people (id);

-- The details only the person reads: what happened, the day, the hours, the
-- rate, any change to the extras (D130) and the tax year (D123).
create table public.pay_adjustment_details (
  id uuid not null,
  plan_id uuid not null references public.plans (id) on delete cascade,
  private_to uuid references public.people (id),
  version integer not null default 1,
  seq bigint not null default 0,
  list_order bigint not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references public.people (id),
  changed_at timestamptz not null default now(),
  changed_by uuid references public.people (id),
  edit_id uuid references public.edits (id),
  deleted boolean not null default false,
  adjustment_id uuid not null references public.pay_adjustments (id),
  kind text not null check (kind in ('overtime', 'missed-shift')),
  worked_on date not null,
  hours app.decimal_text not null,
  rate app.decimal_text not null,
  extras app.pence check (extras > 0),
  tax_year app.tax_year not null,
  primary key (id),
  check (private_to is not null)
);

create index on public.pay_adjustment_details (plan_id, seq);
create unique index pay_adjustment_details_one_each on public.pay_adjustment_details (adjustment_id)
  where not deleted;

-- Overtime or a missed shift: the privacy of the pay it's on, and only on
-- the person's own pay (D303).
create or replace function app.check_pay_adjustment() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then
    perform app.refuse('fixed-field');
  end if;
  -- Every series of a family has one privacy and one person's pay (the
  -- family check), so whoever can see one of them sees what all of them say.
  select true as seen, s.private_to as private, coalesce(s.paid_to, s.private_to) as paid into parent
    from public.series s where s.family_id = new.family_id and s.plan_id = new.plan_id limit 1;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  if app.from_a_person() and parent.paid is distinct from auth.uid() then
    perform app.refuse('not-your-pay');
  end if;
  new.private_to := parent.private;
  new.locked_to := case when parent.private is null then parent.paid end;
  return new;
end;
$$;

-- The details: always the person's own, on overtime of their own.
create function app.check_pay_adjustment_details() returns trigger
language plpgsql set search_path = '' as $$
declare
  adjustment record;
begin
  if tg_op = 'INSERT' then
    if app.from_a_person() then
      new.private_to := auth.uid();
    end if;
  elsif new.private_to is distinct from old.private_to or new.adjustment_id <> old.adjustment_id then
    perform app.refuse('fixed-field');
  end if;
  select true as seen, a.private_to as private, a.locked_to as locked into adjustment
    from public.pay_adjustments a where a.id = new.adjustment_id and a.plan_id = new.plan_id;
  if not coalesce(adjustment.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  if coalesce(adjustment.private, adjustment.locked) is distinct from new.private_to then
    perform app.refuse('not-your-pay');
  end if;
  return new;
end;
$$;

create trigger a_privacy before insert or update on public.pay_adjustment_details
  for each row execute function app.check_pay_adjustment_details();
create trigger b_sync_fields before insert or update on public.pay_adjustment_details
  for each row execute function app.fill_sync_fields();

-- ---------------------------------------------------------------------------
-- The privacy rules for the new table, and the overtime change locked to its
-- person, as "From Jess" is (D293).

alter table public.pay_adjustment_details enable row level security;
revoke all on public.pay_adjustment_details from anon, authenticated, public;
grant select, insert, update on public.pay_adjustment_details to authenticated;

create policy read on public.pay_adjustment_details for select to authenticated
  using (
    plan_id in (select app.my_plans())
    and (private_to is null or private_to = (select auth.uid()))
  );
create policy add on public.pay_adjustment_details for insert to authenticated
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
  );
create policy change on public.pay_adjustment_details for update to authenticated
  using (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
  )
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
  );

drop policy add on public.pay_adjustments;
drop policy change on public.pay_adjustments;
create policy add on public.pay_adjustments for insert to authenticated
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
    and (locked_to is null or locked_to = (select auth.uid()))
  );
create policy change on public.pay_adjustments for update to authenticated
  using (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
    and (locked_to is null or locked_to = (select auth.uid()))
  )
  with check (
    plan_id in (select app.my_plans())
    and (private_to = (select auth.uid())
      or (private_to is null and plan_id in (select app.my_edit_plans())))
    and (locked_to is null or locked_to = (select auth.uid()))
  );

-- ---------------------------------------------------------------------------
-- Who can use which function, as at the end of step 3a: every function in
-- `app` taken back, and only the checks the rules call given to signed-in
-- people (00-every-table.test.sql checks it).
revoke execute on all functions in schema app from public, anon, authenticated;
grant execute on function
  app.session_id(), app.session_ok(), app.my_plans(), app.my_edit_plans(),
  app.my_owned_plans(), app.my_partners(), app.refuse(text, text), app.from_a_person(),
  app.check_chosen_privacy(uuid, uuid, text, uuid, uuid), app.check_link(uuid, boolean, uuid),
  app.account_privacy(uuid, uuid), app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid, uuid)
  to authenticated;
