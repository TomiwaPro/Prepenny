-- Test 3 (brief 8.7 test 3, D51): Tom as "Can view only" can read the shared
-- plan, but can't change, add, remove or tick anything in it. The database
-- refuses, not only the screen.

begin;
create extension if not exists pgtap with schema extensions;

select plan(17);

select tests.make_jess_and_tom('viewer');

select ok(tests.shared_ids() @> array[tests.id('joint'), tests.id('joint-balance'), tests.id('rent'),
    tests.id('rent-change'), tests.id('rent-tick'), tests.id('joint-food'), tests.id('from-jess'),
    tests.id('jess-cafe-pay'), tests.id('jess-cafe-overtime')]::text[]
  and cardinality(tests.shared_ids()) = 13,
  'The list of shared records has all 13, of every kind');

select tests.in_an_edit('tom');

select isnt_empty($$ select id from public.series where id = tests.id('rent') $$,
  'Tom can read the shared rent');
select isnt_empty($$ select id from public.accounts where id = tests.id('joint') $$,
  'Tom can read the joint account');
select isnt_empty($$ select id from public.plans where id = tests.id('plan') $$,
  'Tom can read the plan');

select is(tests.change_rows(tests.shared_ids()), 0::bigint,
  'Tom can''t change anything shared');
select is(tests.remove_rows(tests.shared_ids()), 0::bigint,
  'Tom can''t remove anything shared');

select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-new'), tests.id('plan'), tests.id('joint'), 'Car MOT', 'out', 'bills', 5485, '2026-11-13',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-new'), '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t add a payment');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Tom can''t tick a payment (D51)');
select is(tests.rows_changed($$ update public.ticks set deleted = true where id = tests.id('rent-tick') $$), 0::bigint,
  'Tom can''t untick one');
select throws_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2027-01-01', 2, 56000) $$,
  '42501', null, 'Tom can''t change one payment');
select throws_ok($$ insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('joint'), 1, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t update the joint account''s balance');
select throws_ok($$ insert into public.spends (id, plan_id, budget_id, amount, spent_on, recorded_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('joint-food'), 600, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t record a spend');
select is(tests.rows_changed($$ update public.plans set nation = 'scotland' where id = tests.id('plan') $$), 0::bigint,
  'Tom can''t change the plan''s bank holidays');
select throws_ok($$ delete from public.series where id = tests.id('rent') $$, '42501', null,
  'Tom can''t delete a row outright');
select throws_ok($$ update public.plan_members set role = 'editor' where person_id = tests.id('tom') $$, '42501', null,
  'Tom can''t make himself an editor');

-- His own private account is still his to keep up to date (ARCHITECTURE.md 3.6, D292).
select is(tests.change_rows(array[tests.id('tom-current')::text]), 1::bigint,
  'Tom can still change his own private account');

-- Jess, the owner, can still change the shared plan.
select tests.in_an_edit('jess');
select is(tests.change_rows(array[tests.id('rent')::text]), 1::bigint,
  'Jess can still change the shared rent');

select * from finish();
rollback;
