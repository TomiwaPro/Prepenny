-- Step 3a: what the database fills in itself, so no phone can forget it or
-- get it wrong (ARCHITECTURE.md 3.1 and 3.6, D288 to D293).
--
-- 1. The sync fields: who changed a record and when, its version and the
--    plan's change number. A phone can't set them, so "Changed by Tom" is
--    always true.
-- 2. Privacy: a record on an account takes the account's privacy, and so on
--    down: a payment from its account, a tick from its payment, a spend from
--    its budget. Jess's private account and everything on it is private to
--    her, whatever a phone sends.
-- 3. Links: a record everyone can read never names a record only one person
--    can read (D291). A shared payment to Jess's private debt keeps that link
--    in `private_links`, which only Jess reads.
--
-- Every lookup here runs as the person making the change, under the privacy
-- rules, so naming a record you can't see is refused exactly as naming one
-- that doesn't exist: "not-found", with the privacy rules' own code (42501).

-- True when the change comes from a signed-in person, not the server itself.
create function app.from_a_person() returns boolean
language sql stable set search_path = '' as $$
  select auth.uid() is not null
$$;

grant execute on function app.from_a_person() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The sync fields, on every plan record table.

create function app.fill_sync_fields() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- Someone outside the plan is refused before anything is counted.
  if app.from_a_person() and not exists (select 1 from app.my_plans() p where p = new.plan_id) then
    perform app.refuse('not-found', '42501');
  end if;
  -- The edit that saved it is in the plan, and everyone who can read this
  -- record can read the edit too, so a shared record never names a private
  -- edit (D291). One that doesn't exist is refused the same way.
  if new.edit_id is not null and not exists (select 1 from public.edits e
      where e.id = new.edit_id and e.plan_id = new.plan_id
        and (e.private_to is null or e.private_to is not distinct from new.private_to)) then
    perform app.refuse('not-found', '42501');
  end if;
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := auth.uid();
    new.version := 1;
  else
    if new.id <> old.id or new.plan_id <> old.plan_id then
      perform app.refuse('fixed-field');
    end if;
    new.created_at := old.created_at;
    new.created_by := old.created_by;
    new.version := old.version + 1;
  end if;
  new.changed_at := now();
  new.changed_by := auth.uid();
  new.seq := app.next_seq(new.plan_id, new.private_to);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2 and 3. Privacy and links, one check for each kind of record.

-- A privacy a person chooses: shared, or private to themselves. Only their
-- own, and only for something that's theirs (D16, D65). Sharing a record
-- that was private comes with shared plans in step 3f (D290). Who it belongs
-- to ("From Jess") is set by that person only: nobody can say an account is
-- someone else's.
create function app.check_chosen_privacy(
  new_private uuid, old_private uuid, op text, belongs uuid, old_belongs uuid
) returns void language plpgsql set search_path = '' as $$
begin
  if op = 'UPDATE' and new_private is distinct from old_private then
    perform app.refuse('sharing-comes-later');
  end if;
  if app.from_a_person() and belongs is not null and belongs <> auth.uid()
    and (op = 'INSERT' or belongs is distinct from old_belongs) then
    perform app.refuse('not-found', '42501');
  end if;
  if op = 'INSERT' and new_private is not null and app.from_a_person()
    and new_private <> auth.uid() then
    perform app.refuse('not-found', '42501');
  end if;
  if new_private is not null and belongs is distinct from new_private then
    perform app.refuse('private-belongs-to');
  end if;
end;
$$;

-- A link from a record to another: the other must be one the person can see,
-- and everyone who can read this record must be able to read it too (D291).
create function app.check_link(row_private uuid, target_seen boolean, target_private uuid)
returns void language plpgsql set search_path = '' as $$
begin
  if target_seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  if target_private is not null and target_private is distinct from row_private then
    perform app.refuse('link-to-private');
  end if;
end;
$$;

-- The privacy of an account in this plan that the person can see. `seen` is
-- false when they can't, exactly as when it doesn't exist.
create function app.account_privacy(account uuid, plan uuid, out seen boolean, out private uuid)
language sql stable set search_path = '' as $$
  select coalesce(bool_or(true), false), (array_agg(a.private_to))[1]
  from public.accounts a where a.id = account and a.plan_id = plan
$$;

grant execute on function
  app.check_chosen_privacy(uuid, uuid, text, uuid, uuid), app.check_link(uuid, boolean, uuid),
  app.account_privacy(uuid, uuid)
  to authenticated;

-- Accounts, debts and pay profiles: shared, or private to their person.
create function app.check_owned_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  perform app.check_chosen_privacy(new.private_to, case when tg_op = 'UPDATE' then old.private_to end,
    tg_op, new.belongs_to, case when tg_op = 'UPDATE' then old.belongs_to end);
  return new;
end;
$$;

-- A goal kept in a private account is private too. One kept in a shared
-- account is shared, or private to its person (D65).
create function app.check_goal() returns trigger
language plpgsql set search_path = '' as $$
declare
  account record;
begin
  account := app.account_privacy(new.account_id, new.plan_id);
  if account.seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  if tg_op = 'INSERT' and account.private is not null then
    new.private_to := account.private;
  end if;
  if account.private is not null and new.private_to is distinct from account.private then
    perform app.refuse('sharing-comes-later');
  end if;
  perform app.check_chosen_privacy(new.private_to, case when tg_op = 'UPDATE' then old.private_to end,
    tg_op, new.belongs_to, case when tg_op = 'UPDATE' then old.belongs_to end);
  return new;
end;
$$;

-- Balance updates and budgets take their account's privacy, and stay on it.
create function app.check_on_account() returns trigger
language plpgsql set search_path = '' as $$
declare
  account record;
begin
  if tg_op = 'UPDATE' and new.account_id <> old.account_id then
    perform app.refuse('fixed-field');
  end if;
  account := app.account_privacy(new.account_id, new.plan_id);
  if account.seen is not true then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := account.private;
  return new;
end;
$$;

-- Whether a series fits the family it names (D49, D89): null when it does,
-- or the refusal's code. It looks at every series of the family in the plan,
-- seen or not, because a series slipped into someone's private family, or
-- into "From Jess", would change their payments. It says only whether the
-- series fits, never anything about the others.
create function app.family_problem(
  plan uuid, family uuid, self uuid, account uuid, private uuid, locked uuid, parent uuid
) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self)
      then case when family = self and parent is null then null else 'family-mixed' end
    when exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id <> self
          and (s.account_id <> account or s.private_to is distinct from private
            or s.locked_to is distinct from locked))
      then 'family-mixed'
    when parent is null and family <> self
      then 'family-mixed'
    when parent is not null and not exists (select 1 from public.series s
        where s.plan_id = plan and s.family_id = family and s.id = parent)
      then 'family-mixed'
  end
$$;

grant execute on function app.family_problem(uuid, uuid, uuid, uuid, uuid, uuid, uuid) to authenticated;

-- A series: its account's privacy, and every link checked (D16, D94, D291).
create function app.check_series() returns trigger
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
    or new.locked_to is distinct from old.locked_to) then
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

  -- A family is a series and the series split from it (D49): on one account,
  -- with one privacy and one lock. A series starts a family of its own, or
  -- joins one that's already in the plan, after the series it was split from.
  problem := app.family_problem(new.plan_id, new.family_id, new.id, new.account_id,
    new.private_to, new.locked_to, new.split_from);
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
      or new.set_aside_account_id is not null or new.mirrored_by is not null then
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

-- A change or a tick: its payment's privacy, and locked with it. Payments of
-- a pay-later card are found by the budget (D111).
create function app.check_on_payment() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
  other record;
begin
  if tg_op = 'UPDATE' and (new.series_id is distinct from old.series_id
    or new.budget_id is distinct from old.budget_id or new.original_date <> old.original_date) then
    perform app.refuse('fixed-field');
  end if;
  if new.series_id is not null then
    select true as seen, s.private_to as private, s.locked_to as locked into parent
      from public.series s where s.id = new.series_id and s.plan_id = new.plan_id;
  else
    select true as seen, b.private_to as private, null::uuid as locked into parent
      from public.budgets b where b.id = new.budget_id and b.plan_id = new.plan_id;
  end if;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := parent.private;
  new.locked_to := parent.locked;

  if tg_table_name = 'payment_changes' then
    -- The shared half has no name or note of its own (D94).
    if new.locked_to is not null and (new.name is not null or new.note is not null) then
      perform app.refuse('shared-half');
    end if;
  else
    if tg_op = 'INSERT' then
      new.ticked_by := auth.uid();
    else
      new.ticked_by := old.ticked_by;
    end if;
    if new.in_balance_update is not null then
      other := null;
      select true as seen, u.private_to as private into other
        from public.balance_updates u where u.id = new.in_balance_update and u.plan_id = new.plan_id;
      perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
    end if;
    if new.in_debt_update is not null then
      other := null;
      select true as seen, d.private_to as private into other from public.debts d where d.id = new.in_debt_update and d.plan_id = new.plan_id;
      perform app.check_link(new.private_to, coalesce(other.seen, false), other.private);
    end if;
  end if;
  return new;
end;
$$;

-- A spend: its budget's privacy, recorded by the person who wrote it down.
create function app.check_spend() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'UPDATE' and new.budget_id <> old.budget_id then
    perform app.refuse('fixed-field');
  end if;
  select true as seen, b.private_to as private into parent from public.budgets b where b.id = new.budget_id and b.plan_id = new.plan_id;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := parent.private;
  if tg_op = 'INSERT' then
    new.recorded_by := auth.uid();
  else
    new.recorded_by := old.recorded_by;
  end if;
  return new;
end;
$$;

-- A usual week: its pay profile's privacy.
create function app.check_pay_week() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'UPDATE' and new.pay_profile_id <> old.pay_profile_id then
    perform app.refuse('fixed-field');
  end if;
  select true as seen, p.private_to as private into parent
    from public.pay_profiles p where p.id = new.pay_profile_id and p.plan_id = new.plan_id;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := parent.private;
  return new;
end;
$$;

-- Overtime or a missed shift: the privacy of the pay it's on.
create function app.check_pay_adjustment() returns trigger
language plpgsql set search_path = '' as $$
declare
  parent record;
begin
  if tg_op = 'UPDATE' and new.family_id <> old.family_id then
    perform app.refuse('fixed-field');
  end if;
  select true as seen, s.private_to as private into parent
    from public.series s where s.family_id = new.family_id and s.plan_id = new.plan_id limit 1;
  if not coalesce(parent.seen, false) then
    perform app.refuse('not-found', '42501');
  end if;
  new.private_to := parent.private;
  return new;
end;
$$;

-- Settings, practice changes and private links: always the person's own.
create function app.check_my_own() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if app.from_a_person() then
      new.private_to := auth.uid();
    end if;
  elsif new.private_to is distinct from old.private_to then
    perform app.refuse('fixed-field');
  end if;
  return new;
end;
$$;

-- A private link: what it names must be something the person can see.
create function app.check_private_link() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.family_id is distinct from old.family_id
    or new.tick_id is distinct from old.tick_id) then
    perform app.refuse('fixed-field');
  end if;
  if (new.family_id is not null
      and not exists (select 1 from public.series s where s.family_id = new.family_id and s.plan_id = new.plan_id))
    or (new.tick_id is not null and not exists (select 1 from public.ticks t where t.id = new.tick_id and t.plan_id = new.plan_id))
    or (new.debt_id is not null and not exists (select 1 from public.debts d where d.id = new.debt_id and d.plan_id = new.plan_id))
    or (new.goal_id is not null and not exists (select 1 from public.goals g where g.id = new.goal_id and g.plan_id = new.plan_id))
    or (new.in_debt_update is not null
      and not exists (select 1 from public.debts d where d.id = new.in_debt_update and d.plan_id = new.plan_id)) then
    perform app.refuse('not-found', '42501');
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Each table's triggers. Postgres runs them in the order of their names:
-- privacy first ("a_"), then the sync fields ("b_"), then the privacy rules.

create trigger a_privacy before insert or update on public.accounts
  for each row execute function app.check_owned_record();
create trigger a_privacy before insert or update on public.debts
  for each row execute function app.check_owned_record();
create trigger a_privacy before insert or update on public.pay_profiles
  for each row execute function app.check_owned_record();
create trigger a_privacy before insert or update on public.goals
  for each row execute function app.check_goal();
create trigger a_privacy before insert or update on public.balance_updates
  for each row execute function app.check_on_account();
create trigger a_privacy before insert or update on public.budgets
  for each row execute function app.check_on_account();
create trigger a_privacy before insert or update on public.series
  for each row execute function app.check_series();
create trigger a_privacy before insert or update on public.payment_changes
  for each row execute function app.check_on_payment();
create trigger a_privacy before insert or update on public.ticks
  for each row execute function app.check_on_payment();
create trigger a_privacy before insert or update on public.spends
  for each row execute function app.check_spend();
create trigger a_privacy before insert or update on public.pay_weeks
  for each row execute function app.check_pay_week();
create trigger a_privacy before insert or update on public.pay_adjustments
  for each row execute function app.check_pay_adjustment();
create trigger a_privacy before insert or update on public.settings
  for each row execute function app.check_my_own();
create trigger a_privacy before insert or update on public.practice_changes
  for each row execute function app.check_my_own();
create trigger a_privacy before insert or update on public.private_links
  for each row execute function app.check_my_own();
create trigger a_private_link before insert or update on public.private_links
  for each row execute function app.check_private_link();

do $$
declare
  t text;
begin
  foreach t in array app.record_tables() loop
    execute format('create trigger b_sync_fields before insert or update on public.%I
      for each row execute function app.fill_sync_fields()', t);
  end loop;
end;
$$;
