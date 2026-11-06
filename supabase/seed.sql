-- Helpers for the database tests in supabase/tests (pgTAP). Supabase loads
-- this file into the local test database only: it never reaches the real
-- project, because `supabase db push` doesn't send it (D297).
--
-- `tests.make_jess_and_tom()` builds the shared plan the tests use, brief
-- 8.7's Jess and Tom: Jess's private current account with everything that
-- can be on it, Tom's private account, and their joint account, which they
-- share. Every record is written as the person it belongs to, so the
-- database fills in its privacy and its sync fields as it would for them.

create schema tests;
grant usage on schema tests to anon, authenticated;

-- A fixed id for each name, so the tests can say "jess-current".
create function tests.id(name text) returns uuid
language sql immutable as $$
  select md5('prepenny-test-' || name)::uuid
$$;

-- Acts as a person from now on in this test: their token, with its sign-in
-- session, and the role every signed-in request has.
create function tests.as_person(name text) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', tests.id(name), 'session_id', tests.id(name || '-session'), 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end;
$$;

-- Acts as someone who isn't signed in.
create function tests.as_nobody() returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role', 'anon', true);
end;
$$;

-- Back to the test itself, which can see and change everything.
create function tests.as_test() returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end;
$$;

-- The test writing a record as a person: the database fills in who did it.
create function tests.writing_as(name text) returns void
language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', json_build_object(
    'sub', tests.id(name), 'session_id', tests.id(name || '-session'), 'role', 'authenticated')::text, true);
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;

-- Someone with a sign-in and a session on one phone.
create function tests.make_person(name text) returns void
language plpgsql as $$
begin
  insert into auth.users (id, email) values (tests.id(name), name || '@example.test');
  insert into auth.sessions (id, user_id) values (tests.id(name || '-session'), tests.id(name));
  insert into public.people (id, nickname) values (tests.id(name), initcap(name));
end;
$$;

-- A series with only what every series needs; the rest is null.
create function tests.add_series(
  name text, account text, direction text default 'out', type text default 'other',
  amount bigint default 1000
) returns void
language plpgsql as $$
begin
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id(name), tests.id('plan'), tests.id(account), initcap(replace(name, '-', ' ')),
    direction, type, amount, date '2026-11-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}',
    '{"kind":"never"}', 'keep', tests.id(name), '2026-10-25T08:31:00Z');
end;
$$;

-- Jess and Tom share Jess's plan. Tom's role is "editor" ("Can edit") or
-- "viewer" ("Can view only"). Alex has a sign-in but isn't in the plan.
create function tests.make_jess_and_tom(tom_role text default 'editor') returns void
language plpgsql as $$
begin
  perform tests.make_person('jess');
  perform tests.make_person('tom');
  perform tests.make_person('alex');

  -- Jess makes the plan, and Tom joins it.
  perform tests.writing_as('jess');
  insert into public.plans (id, name) values (tests.id('plan'), 'Our plan');
  insert into public.plan_members (plan_id, person_id, role) values (tests.id('plan'), tests.id('tom'), tom_role);

  -- Jess's private current account, and everything that can be on it.
  insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
  values (tests.id('jess-current'), tests.id('plan'), tests.id('jess'), 'Jess current', 'current', 2000, tests.id('jess'));
  insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (tests.id('jess-balance'), tests.id('plan'), tests.id('jess-current'), 120000, '2026-10-25', '2026-10-25T09:00:00Z');
  perform tests.add_series('jess-pay', 'jess-current', 'in', 'pay', 210000);
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (tests.id('jess-pay-change'), tests.id('plan'), tests.id('jess-pay'), '2026-11-01', 0, 215000);
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at, in_balance_update)
  values (tests.id('jess-pay-tick'), tests.id('plan'), tests.id('jess-pay'), '2026-11-01', 0, '2026-11-01',
    '2026-11-01T08:00:00Z', tests.id('jess-balance'));
  insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves, starts_on, made_at)
  values (tests.id('jess-food'), tests.id('plan'), tests.id('jess-current'), 'Food', 20000, 'month', 'at-start',
    '2026-10-25', '2026-10-25T09:00:00Z');
  insert into public.spends (id, plan_id, budget_id, amount, spent_on, recorded_at)
  values (tests.id('jess-spend'), tests.id('plan'), tests.id('jess-food'), 600, '2026-10-25', '2026-10-25T10:00:00Z');
  insert into public.pay_profiles (id, plan_id, private_to, belongs_to, name, frequency, tax_code, basis)
  values (tests.id('jess-job'), tests.id('plan'), tests.id('jess'), tests.id('jess'), 'Shop job', 'monthly', '1257L', 'cumulative');
  insert into public.pay_weeks (id, plan_id, pay_profile_id, name, lines)
  values (tests.id('jess-week'), tests.id('plan'), tests.id('jess-job'), 'Usual week',
    '[{"name":"Basic","kind":"basic","hours":"37.5","rate":"12.71"}]');
  insert into public.pay_adjustments (id, plan_id, family_id, payment_number, kind, worked_on, hours, rate, change, tax_year)
  values (tests.id('jess-overtime'), tests.id('plan'), tests.id('jess-pay'), 0, 'overtime', '2026-10-27', '3', '19.07', 4500, '2026-27');
  insert into public.debts (id, plan_id, private_to, belongs_to, name, kind, balance, balance_on, balance_at, starting_balance)
  values (tests.id('jess-card'), tests.id('plan'), tests.id('jess'), tests.id('jess'), 'Jess card', 'credit-card',
    42099, '2026-10-25', '2026-10-25T09:00:00Z', 42099);
  insert into public.goals (id, plan_id, name, target, account_id, belongs_to)
  values (tests.id('jess-goal'), tests.id('plan'), 'Jess holiday', 120000, tests.id('jess-current'), tests.id('jess'));
  perform tests.add_series('jess-card-payment', 'jess-current', 'out', 'debt', 2500);
  update public.series set debt_id = tests.id('jess-card') where id = tests.id('jess-card-payment');

  -- The joint account, which they share.
  insert into public.accounts (id, plan_id, name, kind, warning_level)
  values (tests.id('joint'), tests.id('plan'), 'Joint', 'joint', 2000);
  insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (tests.id('joint-balance'), tests.id('plan'), tests.id('joint'), 80000, '2026-10-25', '2026-10-25T09:00:00Z');
  perform tests.add_series('rent', 'joint', 'out', 'rent', 110000);
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, note)
  values (tests.id('rent-change'), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, 'Paid early');
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('rent-tick'), tests.id('plan'), tests.id('rent'), '2026-11-01', 0, '2026-11-01', '2026-11-01T09:00:00Z');
  insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves, starts_on, made_at)
  values (tests.id('joint-food'), tests.id('plan'), tests.id('joint'), 'Joint food', 30000, 'month', 'at-start',
    '2026-10-25', '2026-10-25T09:00:00Z');

  -- £600 from Jess's private account to the joint account: the private half
  -- on her account, and "From Jess" on the joint account, locked to her (D16).
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, locked_to)
  values (tests.id('from-jess'), tests.id('plan'), tests.id('joint'), 'From Jess', 'in', 'savings', 60000,
    '2026-10-28', '{"kind":"monthly","every":1,"on":{"kind":"day","day":28}}', '{"kind":"never"}',
    'working-day-before', tests.id('from-jess'), '2026-10-25T08:31:00Z', tests.id('jess'));
  perform tests.add_series('jess-to-joint', 'jess-current', 'out', 'savings', 60000);
  update public.series set mirrored_by = tests.id('from-jess') where id = tests.id('jess-to-joint');
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('from-jess-tick'), tests.id('plan'), tests.id('from-jess'), '2026-10-28', 0, '2026-10-28',
    '2026-10-28T09:00:00Z');

  -- A payment to Jess's private card from the joint account (D65, PLAN.md
  -- item 5): the payment is shared, and its link to the card is private.
  perform tests.add_series('joint-card-payment', 'joint', 'out', 'debt', 2500);
  insert into public.private_links (id, plan_id, family_id, debt_id)
  values (tests.id('jess-card-link'), tests.id('plan'), tests.id('joint-card-payment'), tests.id('jess-card'));
  -- Ticked inside the card's Update from statement (D62), which only Jess's sums use.
  insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('joint-card-tick'), tests.id('plan'), tests.id('joint-card-payment'), '2026-11-01', 0,
    '2026-11-01', '2026-11-01T09:30:00Z');
  insert into public.private_links (id, plan_id, tick_id, in_debt_update)
  values (tests.id('jess-tick-link'), tests.id('plan'), tests.id('joint-card-tick'), tests.id('jess-card'));
  -- A savings goal of Jess's own, kept in the joint account, and money into it.
  insert into public.goals (id, plan_id, private_to, name, target, account_id, belongs_to)
  values (tests.id('jess-surprise'), tests.id('plan'), tests.id('jess'), 'Jess surprise', 30000, tests.id('joint'),
    tests.id('jess'));
  perform tests.add_series('joint-saving', 'joint', 'in', 'savings', 1000);
  insert into public.private_links (id, plan_id, family_id, goal_id)
  values (tests.id('jess-surprise-link'), tests.id('plan'), tests.id('joint-saving'), tests.id('jess-surprise'));

  -- Jess's own settings and a practice change, always private to her.
  insert into public.settings (id, plan_id, main_pay_family_id)
  values (tests.id('jess-settings'), tests.id('plan'), tests.id('jess-pay'));
  insert into public.practice_changes (id, plan_id, commands, message)
  values (tests.id('jess-practice'), tests.id('plan'), '[{"kind":"skip"}]', 'Rent skipped.');

  -- Tom's own private account, and his settings.
  perform tests.writing_as('tom');
  insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
  values (tests.id('tom-current'), tests.id('plan'), tests.id('tom'), 'Tom current', 'current', 2000, tests.id('tom'));
  insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (tests.id('tom-balance'), tests.id('plan'), tests.id('tom-current'), 50000, '2026-10-25', '2026-10-25T09:00:00Z');
  perform tests.add_series('tom-pay', 'tom-current', 'in', 'pay', 190000);
  insert into public.settings (id, plan_id, main_pay_family_id)
  values (tests.id('tom-settings'), tests.id('plan'), tests.id('tom-pay'));

  perform tests.as_test();
end;
$$;

-- The plan record tables, for helpers that run as a signed-in person, who
-- can't use the database's own list.
create function tests.record_tables() returns text[]
language sql stable security definer set search_path = '' as $$
  select app.record_tables()
$$;

-- Every table in the app's part of the database, for the tests that try them all.
create function tests.every_table() returns setof text
language sql stable as $$
  select tablename::text from pg_tables where schemaname = 'public' order by tablename
$$;

-- How many rows of a table the person acting now can read.
create function tests.readable(t text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I', t) into n;
  return n;
end;
$$;

-- Every row the person acting now can read in any table, as "table:id".
create function tests.readable_rows() returns setof text
language plpgsql as $$
declare
  t text;
begin
  for t in select tests.every_table() loop
    return query execute format(
      'select %L || '':'' || coalesce(to_jsonb(r) ->> ''id'', to_jsonb(r) ->> ''plan_id'') from public.%I r', t, t);
  end loop;
end;
$$;

-- The ids of every record private to a person, across every table. A test
-- helper only: it reads past the privacy rules on purpose.
create function tests.private_ids(person text) returns text[]
language sql stable security definer set search_path = '' as $$
  select array_agg(id::text) from (
    select id from public.accounts where private_to = tests.id(person)
    union all select id from public.balance_updates where private_to = tests.id(person)
    union all select id from public.debts where private_to = tests.id(person)
    union all select id from public.pay_profiles where private_to = tests.id(person)
    union all select id from public.pay_weeks where private_to = tests.id(person)
    union all select id from public.goals where private_to = tests.id(person)
    union all select id from public.budgets where private_to = tests.id(person)
    union all select id from public.series where private_to = tests.id(person)
    union all select id from public.payment_changes where private_to = tests.id(person)
    union all select id from public.ticks where private_to = tests.id(person)
    union all select id from public.spends where private_to = tests.id(person)
    union all select id from public.pay_adjustments where private_to = tests.id(person)
    union all select id from public.settings where private_to = tests.id(person)
    union all select id from public.practice_changes where private_to = tests.id(person)
    union all select id from public.private_links where private_to = tests.id(person)
  ) ids
$$;

-- The ids of every shared record in the plan, and of every record at all.
-- Test helpers only: they read past the privacy rules on purpose.
create function tests.shared_ids() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  found_ids text[];
  ids text[] := array[]::text[];
begin
  for t in select unnest(app.record_tables()) loop
    execute format('select array_agg(id::text) from public.%I where private_to is null', t) into found_ids;
    ids := ids || coalesce(found_ids, '{}');
  end loop;
  return ids;
end;
$$;

create function tests.all_ids() returns text[]
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
  found_ids text[];
  ids text[] := array[]::text[];
begin
  for t in select unnest(app.record_tables()) loop
    execute format('select array_agg(id::text) from public.%I', t) into found_ids;
    ids := ids || coalesce(found_ids, '{}');
  end loop;
  return ids;
end;
$$;

-- Every row the person acting now can read that is, or names, one of these
-- ids anywhere in it, as "table:id". Empty means nothing of them shows.
create function tests.rows_naming(ids text[]) returns setof text
language plpgsql as $$
declare
  t text;
begin
  for t in select tests.every_table() loop
    return query execute format($q$
      select %L || ':' || coalesce(to_jsonb(r) ->> 'id', to_jsonb(r) ->> 'plan_id')
      from public.%I r
      where exists (
        select 1 from jsonb_path_query(to_jsonb(r), 'strict $.**') v
        where jsonb_typeof(v) = 'string' and v #>> '{}' = any ($1)
      )$q$, t, t) using ids;
  end loop;
end;
$$;

-- Runs one change as the person acting now, and gives back how many rows it changed.
create function tests.rows_changed(statement text) returns bigint
language plpgsql as $$
declare
  n bigint;
begin
  execute statement;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Tries to change every row with one of these ids, in every table, as the
-- person acting now. Gives back how many rows were changed.
create function tests.change_rows(ids text[]) returns bigint
language plpgsql as $$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  for t in select unnest(tests.record_tables()) loop
    execute format('with changed as (update public.%I set list_order = list_order + 1
      where id::text = any ($1) returning 1) select count(*) from changed', t) into n using ids;
    total := total + n;
  end loop;
  return total;
end;
$$;

-- Tries to mark every row with one of these ids as removed.
create function tests.remove_rows(ids text[]) returns bigint
language plpgsql as $$
declare
  t text;
  n bigint;
  total bigint := 0;
begin
  for t in select unnest(tests.record_tables()) loop
    execute format('with changed as (update public.%I set deleted = true
      where id::text = any ($1) returning 1) select count(*) from changed', t) into n using ids;
    total := total + n;
  end loop;
  return total;
end;
$$;

grant execute on all functions in schema tests to anon, authenticated;
