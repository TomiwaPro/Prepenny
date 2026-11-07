-- Test 2 (brief 8.7 test 2): Jess and Tom share a plan. Jess's private
-- account and everything on it (payments, ticks, balance updates, budgets
-- and spends) can't be read or changed by Tom through any table or function.

begin;
create extension if not exists pgtap with schema extensions;

select plan(29);

select tests.make_jess_and_tom('editor');

-- The list of Jess's private records really has every kind in it, so the
-- checks below that use it cover them all.
select ok(tests.private_ids('jess') @> array[
    tests.id('jess-current'), tests.id('jess-balance'), tests.id('jess-pay'), tests.id('jess-pay-change'),
    tests.id('jess-pay-tick'), tests.id('jess-food'), tests.id('jess-spend'), tests.id('jess-job'),
    tests.id('jess-week'), tests.id('jess-overtime'), tests.id('jess-card'), tests.id('jess-goal'),
    tests.id('jess-to-joint'), tests.id('jess-settings'), tests.id('jess-card-link'),
    tests.id('jess-overtime-details'), tests.id('jess-cafe-job'), tests.id('jess-cafe-week'),
    tests.id('jess-cafe-pay-job'), tests.id('jess-cafe-overtime-details')
  ]::text[] and cardinality(tests.private_ids('jess')) = 24,
  'The list of Jess''s private records has all 24, of every kind');

-- As Tom, who can edit the shared plan.
select tests.in_an_edit('tom');

select is_empty($$ select * from tests.rows_naming(tests.private_ids('jess')) $$,
  'No row Tom can read, in any table, is one of Jess''s private records or names one');

select is_empty($$ select id from public.accounts where id = tests.id('jess-current') $$,
  'Tom can''t read Jess''s private account');
select is_empty($$ select id from public.balance_updates where account_id = tests.id('jess-current') $$,
  'Tom can''t read its balance updates');
select is_empty($$ select id from public.series where account_id = tests.id('jess-current') $$,
  'Tom can''t read its payments');
select is_empty($$ select id from public.ticks where series_id = tests.id('jess-pay') $$,
  'Tom can''t read their ticks');
select is_empty($$ select id from public.payment_changes where series_id = tests.id('jess-pay') $$,
  'Tom can''t read their one-off changes');
select is_empty($$ select id from public.budgets where account_id = tests.id('jess-current') $$,
  'Tom can''t read its budgets');
select is_empty($$ select id from public.spends where budget_id = tests.id('jess-food') $$,
  'Tom can''t read their spends');
select is_empty($$ select id from public.pay_adjustments where family_id = tests.id('jess-pay') $$,
  'Tom can''t read the overtime on her pay');
select is_empty($$ select id from public.settings where private_to = tests.id('jess') $$,
  'Tom can''t read her settings, such as her main pay');
select is_empty($$ select id from public.pay_adjustment_details $$,
  'Tom can''t read the details of any overtime of hers: the day, the hours or the rate');

select is(tests.change_rows(tests.private_ids('jess')), 0::bigint,
  'Tom can''t change any of Jess''s private records');
select is(tests.remove_rows(tests.private_ids('jess')), 0::bigint,
  'Tom can''t remove any of them');

select throws_ok($$ insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-current'), 1, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t update the balance of Jess''s private account');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-new'), tests.id('plan'), tests.id('jess-current'), 'New', 'out', 'other', 100, '2026-11-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-new'), '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t add a payment to it');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-pay'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Tom can''t tick one of its payments');
select throws_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-pay'), '2026-12-01', 1, 1) $$,
  '42501', null, 'Tom can''t change one of its payments');
select throws_ok($$ insert into public.spends (id, plan_id, budget_id, amount, spent_on, recorded_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-food'), 100, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t record a spend on its budget');
select throws_ok($$ insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves, starts_on, made_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-current'), 'Mine', 100, 'week', 'at-start',
    '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t add a budget to it');
select throws_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-pay'), 1, 3000) $$,
  '42501', null, 'Tom can''t add overtime to her pay');

-- Through the joint account, too.
select throws_ok($$ insert into public.series (id, plan_id, account_id, to_account_id, name, direction, type, amount,
    start_date, schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-move'), tests.id('plan'), tests.id('joint'), tests.id('jess-current'), 'Move', 'transfer',
    'savings', 100, '2026-11-01', '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-move'),
    '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Tom can''t move money from the joint account into her private account');
select throws_ok($$ update public.ticks set in_balance_update = tests.id('jess-balance') where id = tests.id('rent-tick') $$,
  '42501', null, 'Tom can''t link a shared tick to her private balance update');

-- Through the functions a signed-in person can use: each answers only about Tom.
select is((select seen from app.account_privacy(tests.id('jess-current'), tests.id('plan'))), false,
  'Asking about her account''s privacy says only that Tom can''t see it, the same as for one that doesn''t exist');
select set_eq($$ select app.my_plans() $$, array[tests.id('plan')],
  'Tom''s plans are only his own');

-- What Tom can do: the shared plan is still his to read and change.
select set_eq($$ select id from public.accounts $$, array[tests.id('joint'), tests.id('tom-current')],
  'Tom reads the joint account and his own, and no other');
select is((select count(*) from public.series where id = tests.id('from-jess') and name = 'From Jess'), 1::bigint,
  'Tom sees Jess''s £600 arrive in the joint account, as "From Jess"');
select is(tests.change_rows(array[tests.id('rent')::text]), 1::bigint,
  'Tom can change the shared rent');

-- And Jess still reads everything of her own.
select tests.in_an_edit('jess');
select is((select count(*) from public.series where account_id = tests.id('jess-current')), 3::bigint,
  'Jess reads every payment on her own account');

select * from finish();
rollback;
