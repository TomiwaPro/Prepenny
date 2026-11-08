-- From the owner's reviewer of step 3c (D345): every change a person makes
-- goes through save_edit, so it's in the history, follows the family rules
-- and nudges the plan's other phones. A person's insert or update on any
-- record table, or on the plan's own row, made straight through the Data API
-- (REST or GraphQL), is refused with "use-save-edit": for the owner (Jess),
-- someone who can edit (Tom) and someone who can only view (Alex). The same
-- changes through save_edit still work, and start_plan still makes a plan.

begin;
create extension if not exists pgtap with schema extensions;

select plan(31);

select tests.make_jess_and_tom('editor');

-- Alex can only view the plan. Jess's and Tom's settings go, so each of the
-- three can save a first one of their own below (one each, D290).
select tests.as_test();
insert into public.plan_members (plan_id, person_id, role) values (tests.id('plan'), tests.id('alex'), 'viewer');
delete from public.settings;

-- One record of every kind a person can make, all their own: a private
-- account with a balance, a budget and a spend, a card, a goal, a job with its
-- usual week, pay with a one-off change, a tick and overtime with its details,
-- their settings, and their own pay into the joint account with its job,
-- which links privately (D303, D311). In the order save_edit needs them.
create function tests.everything_of(who text) returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('table', w.t, 'id', tests.id(who || '-own-' || w.name), 'version', null,
      'row', w.r) order by w.n)
  from (values
    (1, 'accounts', 'account', jsonb_build_object('private_to', tests.id(who), 'belongs_to', tests.id(who),
      'name', 'Own', 'kind', 'current', 'warning_level', 0)),
    (2, 'debts', 'card', jsonb_build_object('private_to', tests.id(who), 'belongs_to', tests.id(who),
      'name', 'Own card', 'kind', 'credit-card', 'balance', 1000, 'balance_on', '2026-11-01',
      'balance_at', '2026-11-01T09:00:00Z', 'starting_balance', 1000)),
    (3, 'pay_profiles', 'job', jsonb_build_object('private_to', tests.id(who), 'belongs_to', tests.id(who),
      'name', 'Own job', 'frequency', 'monthly', 'tax_code', '1257L', 'basis', 'cumulative')),
    (4, 'pay_weeks', 'week', jsonb_build_object('pay_profile_id', tests.id(who || '-own-job'), 'name', 'Usual week',
      'lines', '[{"name":"Basic","kind":"basic","hours":"37.5","rate":"12.71"}]'::jsonb)),
    (5, 'goals', 'goal', jsonb_build_object('account_id', tests.id(who || '-own-account'),
      'belongs_to', tests.id(who), 'name', 'Own goal', 'target', 10000)),
    (6, 'budgets', 'food', jsonb_build_object('account_id', tests.id(who || '-own-account'), 'name', 'Own food',
      'amount', 5000, 'every', 'month', 'leaves', 'at-start', 'starts_on', '2026-11-01',
      'made_at', '2026-11-01T09:00:00Z')),
    (7, 'series', 'pay', jsonb_build_object('account_id', tests.id(who || '-own-account'), 'name', 'Own pay',
      'direction', 'in', 'type', 'pay', 'amount', 100000, 'start_date', '2026-11-01',
      'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}'::jsonb,
      'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'family_id', tests.id(who || '-own-pay'),
      'family_created_at', '2026-11-01T09:00:00Z')),
    (8, 'balance_updates', 'balance', jsonb_build_object('account_id', tests.id(who || '-own-account'),
      'balance', 5000, 'checked_on', '2026-11-01', 'checked_at', '2026-11-01T09:00:00Z')),
    (9, 'payment_changes', 'pay-change', jsonb_build_object('series_id', tests.id(who || '-own-pay'),
      'original_date', '2026-11-01', 'payment_number', 0, 'amount', 101000)),
    (10, 'ticks', 'pay-tick', jsonb_build_object('series_id', tests.id(who || '-own-pay'),
      'original_date', '2026-11-01', 'payment_number', 0, 'paid_on', '2026-11-01',
      'ticked_at', '2026-11-01T09:00:00Z')),
    (11, 'spends', 'spend', jsonb_build_object('budget_id', tests.id(who || '-own-food'), 'amount', 500,
      'spent_on', '2026-11-01', 'recorded_at', '2026-11-01T10:00:00Z')),
    (12, 'pay_adjustments', 'overtime', jsonb_build_object('family_id', tests.id(who || '-own-pay'),
      'payment_number', 0, 'change', 2000)),
    (13, 'pay_adjustment_details', 'overtime-details', jsonb_build_object(
      'adjustment_id', tests.id(who || '-own-overtime'), 'kind', 'overtime', 'worked_on', '2026-10-27',
      'hours', '2', 'rate', '15.00', 'tax_year', '2026-27')),
    (14, 'settings', 'settings', jsonb_build_object('main_pay_family_id', tests.id(who || '-own-pay'))),
    (15, 'series', 'joint-pay', jsonb_build_object('account_id', tests.id('joint'), 'name', 'Own pay to joint',
      'direction', 'in', 'type', 'pay', 'amount', 5000, 'start_date', '2026-11-01',
      'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}'::jsonb,
      'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'family_id', tests.id(who || '-own-joint-pay'),
      'family_created_at', '2026-11-01T09:00:00Z', 'paid_to', tests.id(who))),
    (16, 'private_links', 'joint-pay-job', jsonb_build_object('private_to', tests.id(who),
      'series_id', tests.id(who || '-own-joint-pay'), 'pay_profile_id', tests.id(who || '-own-job'),
      'cycle_pay_weeks', jsonb_build_array(tests.id(who || '-own-week'))))
  ) as w(n, t, name, r)
$$;

-- Each of those changes made straight on its table, as the person acting
-- now: the insert save_edit would make, or `list_order` one higher on the
-- record. Gives back what happened to each, in order: the refusal's code, or
-- how many rows changed.
create function tests.straight(writes jsonb, how text) returns text[] language plpgsql as $$
declare
  w jsonb;
  columns text;
  n bigint;
  outcomes text[] := '{}';
begin
  for w in select * from jsonb_array_elements(writes) loop
    begin
      if how = 'insert' then
        select string_agg(format('%I', k), ', ') into columns from jsonb_object_keys(w -> 'row') k;
        execute format('insert into public.%1$I (id, plan_id, %2$s)
            select $1, $2, %2$s from jsonb_populate_record(null::public.%1$I, $3)', w ->> 'table', columns)
          using (w ->> 'id')::uuid, tests.id('plan'), w -> 'row';
      else
        execute format('update public.%I set list_order = list_order + 1 where id = $1', w ->> 'table')
          using (w ->> 'id')::uuid;
      end if;
      get diagnostics n = row_count;
      outcomes := array_append(outcomes, (w ->> 'table') || ': ' || n || ' changed');
    exception when others then
      outcomes := array_append(outcomes, (w ->> 'table') || ': ' || sqlerrm);
    end;
  end loop;
  return outcomes;
end;
$$;

-- What every one of them is expected to come to.
create function tests.all_refused(writes jsonb) returns text[] language sql as $$
  select array_agg((w ->> 'table') || ': use-save-edit' order by n)
  from jsonb_array_elements(writes) with ordinality as e(w, n)
$$;

-- The same records' `list_order` changed through save_edit, at the version
-- each is now.
create function tests.reorder(who text) returns jsonb language plpgsql as $$
declare
  w jsonb;
  version integer;
  writes jsonb := '[]';
begin
  for w in select * from jsonb_array_elements(tests.everything_of(who)) loop
    execute format('select version from public.%I where id = $1', w ->> 'table') into version using (w ->> 'id')::uuid;
    writes := writes || jsonb_build_object('table', w ->> 'table', 'id', w ->> 'id', 'version', version,
      'row', jsonb_build_object('list_order', 7));
  end loop;
  return writes;
end;
$$;

-- How many of a person's own records have that `list_order`, and name the edit.
create function tests.reordered(who text, edit text) returns bigint language plpgsql as $$
declare
  w jsonb;
  n bigint;
  total bigint := 0;
begin
  for w in select * from jsonb_array_elements(tests.everything_of(who)) loop
    execute format('select count(*) from public.%I where id = $1 and list_order = 7 and edit_id = $2', w ->> 'table')
      into n using (w ->> 'id')::uuid, tests.id(edit);
    total := total + n;
  end loop;
  return total;
end;
$$;

create function tests.save(edit text, writes jsonb) returns jsonb language sql as $$
  select public.save_edit(tests.id('plan'), tests.id(edit), '2026-11-07T10:00:00Z', 'test', writes)
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Every record table, for each of the three.

select tests.as_person('jess');
select is(tests.straight(tests.everything_of('jess'), 'insert'), tests.all_refused(tests.everything_of('jess')),
  'Jess, the owner, can''t add a record of any kind straight on its table');
select is(tests.save('jess-adds', tests.everything_of('jess')) ->> 'saved', 'new',
  'The same records through save_edit are saved');
select is(jsonb_array_length(tests.save('jess-adds', tests.everything_of('jess')) -> 'rows'), 16,
  'all 16 of them');
select is(tests.straight(tests.everything_of('jess'), 'update'), tests.all_refused(tests.everything_of('jess')),
  'She can''t change any of them straight on its table');
select is(tests.save('jess-reorders', tests.reorder('jess')) ->> 'saved', 'new',
  'The same changes through save_edit are saved');
select is(tests.reordered('jess', 'jess-reorders'), 16::bigint,
  'every one of them, each naming the edit that saved it');

select tests.as_person('tom');
select is(tests.straight(tests.everything_of('tom'), 'insert'), tests.all_refused(tests.everything_of('tom')),
  'Tom, who can edit, can''t add a record of any kind straight on its table');
select is(jsonb_array_length(tests.save('tom-adds', tests.everything_of('tom')) -> 'rows'), 16,
  'The same 16 through save_edit are saved');
select is(tests.straight(tests.everything_of('tom'), 'update'), tests.all_refused(tests.everything_of('tom')),
  'He can''t change any of them straight on its table');
select is(tests.save('tom-reorders', tests.reorder('tom')) ->> 'saved', 'new',
  'The same changes through save_edit are saved');
select is(tests.reordered('tom', 'tom-reorders'), 16::bigint, 'every one of them');
select is(tests.straight(jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'))), 'update'),
  array['series: use-save-edit'], 'Nor can he change the shared rent straight on its table');

select tests.as_person('alex');
select is(tests.straight(tests.everything_of('alex'), 'insert'), tests.all_refused(tests.everything_of('alex')),
  'Alex, who can only view, can''t add a record of any kind straight on its table');
select is(jsonb_array_length(tests.save('alex-adds', tests.everything_of('alex')) -> 'rows'), 16,
  'The same 16 through save_edit are saved: his own records, and his own pay into the joint account (D311)');
select is(tests.straight(tests.everything_of('alex'), 'update'), tests.all_refused(tests.everything_of('alex')),
  'He can''t change any of them straight on its table');
select is(tests.save('alex-reorders', tests.reorder('alex')) ->> 'saved', 'new',
  'The same changes through save_edit are saved');
select is(tests.reordered('alex', 'alex-reorders'), 16::bigint, 'every one of them');
select is(tests.straight(jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'))), 'update'),
  array['series: 0 changed'], 'The shared rent he can''t change at all: straight on its table, nothing changes');

-- Every change above is in the history, as its person's (D296).
select tests.as_test();
select is((select count(*) from public.edits where id in (tests.id('jess-adds'), tests.id('jess-reorders'),
    tests.id('tom-adds'), tests.id('tom-reorders'), tests.id('alex-adds'), tests.id('alex-reorders'))),
  6::bigint, 'Every one of those six edits is in the history');

-- ---------------------------------------------------------------------------
-- The plan's own row: its nation, and making a plan.

create function tests.nation_straight() returns text language plpgsql as $$
declare
  n bigint;
begin
  update public.plans set nation = 'scotland' where id = tests.id('plan');
  get diagnostics n = row_count;
  return n || ' changed';
exception when others then
  return sqlerrm;
end;
$$;
create function tests.nation_write(nation text) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('table', 'plans', 'id', tests.id('plan'),
    'version', (select version from public.plans where id = tests.id('plan')), 'row', jsonb_build_object('nation', nation)))
$$;
grant execute on all functions in schema tests to authenticated;

select tests.as_person('jess');
select is(tests.nation_straight(), 'use-save-edit', 'Jess can''t change the plan''s nation straight on its row');
select is(tests.save('jess-nation', tests.nation_write('scotland')) ->> 'saved', 'new',
  'Through save_edit she can');
select tests.as_person('tom');
select is(tests.nation_straight(), 'use-save-edit', 'Nor can Tom straight on its row');
select is(tests.save('tom-nation', tests.nation_write('northern-ireland')) ->> 'saved', 'new',
  'Through save_edit he can');
select tests.as_person('alex');
select is(tests.nation_straight(), '0 changed', 'Alex, who can only view, changes nothing straight on its row');
select throws_ok($$ select tests.save('alex-nation', tests.nation_write('scotland')) $$, '42501', 'not-allowed',
  'And through save_edit he''s refused, as before (D319)');
select tests.as_test();
select is((select nation from public.plans where id = tests.id('plan')), 'northern-ireland',
  'So the nation is the one Tom saved last');

-- Making a plan: start_plan only. Its mark lets in the one plan it makes,
-- and ends with it.
select tests.as_person('alex');
select throws_ok($$ insert into public.plans (id) values (tests.id('alex-straight-plan')) $$, '42501', 'use-save-edit',
  'Alex can''t make a plan straight on the table');
select lives_ok($$ select public.start_plan(tests.id('alex-plan'), 'scotland') $$, 'start_plan makes him one');
select throws_ok($$ insert into public.plans (id) values (tests.id('alex-plan-2')) $$, '42501', 'use-save-edit',
  'and straight after it, in the same request, any other plan of his own making is still refused');

-- save_edit's mark ends with it too, so one request with two steps, as
-- GraphQL allows, can't slip a change of its own in after it.
select tests.as_person('jess');
select tests.save('jess-then', tests.nation_write('england-and-wales'));
select is(tests.straight(jsonb_build_array(jsonb_build_object('table', 'accounts', 'id', tests.id('jess-own-account'))),
    'update'), array['accounts: use-save-edit'],
  'Straight after save_edit, in the same request, a change of Jess''s own is still refused');

-- Only a person is refused: the database itself still writes for a person,
-- as the tests' set-up and the end-to-end tests do.
select tests.writing_as('jess');
select lives_ok($$ update public.series set list_order = 3 where id = tests.id('rent') $$,
  'The database itself still writes for a person');

select * from finish();
rollback;
