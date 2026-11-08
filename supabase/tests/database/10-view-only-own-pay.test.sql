-- The owner's answer for step 3b (D311): someone with "Can view only" can
-- still add and change their own pay, and overtime and missed shifts on it,
-- even when the pay goes into a shared account. Only their own pay: they
-- still can't touch anyone else's pay, or any other shared record.

begin;
create extension if not exists pgtap with schema extensions;

select plan(22);

select tests.make_jess_and_tom('viewer');
select tests.in_an_edit('tom');

-- Tom's own pay, into the joint account.
select lives_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, paid_to)
  values (tests.id('tom-joint-pay'), tests.id('plan'), tests.id('joint'), 'Tom pay', 'in', 'pay', 180000, '2026-11-27',
    '{"kind":"monthly","every":1,"on":{"kind":"day","day":27}}', '{"kind":"never"}', 'working-day-before',
    tests.id('tom-joint-pay'), '2026-10-26T09:00:00Z', tests.id('tom')) $$,
  'Tom, who can only view, adds his own pay into the joint account');
select is(tests.rows_changed($$ update public.series set amount = 185000 where id = tests.id('tom-joint-pay') $$),
  1::bigint, 'He changes its amount');
select lives_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number, paid_to)
  values (tests.id('tom-joint-pay-later'), tests.id('plan'), tests.id('joint'), 'Tom pay', 'in', 'pay', 190000,
    '2027-01-27', '{"kind":"monthly","every":1,"on":{"kind":"day","day":27}}', '{"kind":"never"}',
    'working-day-before', tests.id('tom-joint-pay'), '2026-10-26T09:00:00Z', tests.id('tom-joint-pay'), 2,
    tests.id('tom')) $$,
  'He changes it for this and all later ones');
select lives_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (tests.id('tom-real-pay'), tests.id('plan'), tests.id('tom-joint-pay'), '2026-11-27', 0, 181234) $$,
  'He types the real amount of one payday');
select lives_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('tom-pay-arrived'), tests.id('plan'), tests.id('tom-joint-pay'), '2026-11-27', 0, '2026-11-27',
    '2026-11-27T09:00:00Z') $$,
  'He marks it as arrived');
select lives_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (tests.id('tom-overtime'), tests.id('plan'), tests.id('tom-joint-pay'), 1, 4500) $$,
  'He adds overtime to it');
select lives_ok($$ insert into public.pay_adjustment_details (id, plan_id, adjustment_id, kind, worked_on, hours, rate,
    tax_year)
  values (tests.id('tom-overtime-details'), tests.id('plan'), tests.id('tom-overtime'), 'overtime', '2026-11-20', '3',
    '15', '2026-27') $$,
  'And its details, which only he reads');
select lives_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (tests.id('tom-missed'), tests.id('plan'), tests.id('tom-joint-pay'), 2, -6000) $$,
  'He adds a missed shift to it');
select is(tests.rows_changed($$ update public.pay_adjustments set change = 5000 where id = tests.id('tom-overtime') $$),
  1::bigint, 'He changes the overtime');
select is(tests.rows_changed($$ update public.series set deleted = true where id = tests.id('tom-joint-pay-later') $$),
  1::bigint, 'He removes his own pay');

-- Only his own pay.
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-other-income'), tests.id('plan'), tests.id('joint'), 'Gift', 'in', 'other', 5000, '2026-12-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-other-income'), '2026-10-26T09:00:00Z') $$,
  '42501', null, 'He can''t add money coming in that isn''t his pay');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, paid_to, set_aside_percent, set_aside_account_id)
  values (tests.id('tom-pay-set-aside'), tests.id('plan'), tests.id('joint'), 'Tom pay', 'in', 'pay', 1000, '2026-12-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-pay-set-aside'), '2026-10-26T09:00:00Z',
    tests.id('tom'), '25', tests.id('joint')) $$,
  '42501', null, 'Nor pay that sets money aside, which would move money in the plan as well');
select throws_ok($$ update public.series set direction = 'out' where id = tests.id('tom-joint-pay') $$,
  '42501', null, 'Nor turn his pay into money going out');
select is(tests.rows_changed($$ update public.series set amount = 1 where id = tests.id('jess-cafe-pay') $$),
  0::bigint, 'He still can''t change Jess''s pay in the joint account');
select throws_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), '2026-12-01', 1, 1) $$,
  '42501', null, 'Nor give one of her paydays another amount');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), '2026-12-01', 1, '2026-12-01',
    '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Nor mark her pay as arrived');
select throws_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), 2, 3000) $$,
  'P0001', 'not-your-pay', 'Nor add overtime to her pay');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Nor tick the shared rent (D51)');
select is(tests.change_rows(array[tests.id('rent')::text, tests.id('joint')::text, tests.id('joint-food')::text,
    tests.id('rent-change')::text, tests.id('from-jess')::text]), 0::bigint,
  'Nor change anything else shared: the rent, the joint account, its budget, a one-off change or "From Jess"');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('tom-new-bill'), tests.id('plan'), tests.id('joint'), 'Car MOT', 'out', 'bills', 5485, '2026-11-13',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-new-bill'), '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Nor add a payment going out');

-- Jess, who can edit, sees his pay and its overtime as amounts, and can't change the overtime.
select tests.in_an_edit('jess');
select is((select change::bigint from public.pay_adjustments where id = tests.id('tom-overtime')), 5000::bigint,
  'Jess reads the change Tom''s overtime makes, as an amount');
select is(tests.rows_changed($$ update public.pay_adjustments set change = 1 where id = tests.id('tom-overtime') $$),
  0::bigint, 'But can''t change it: only Tom can');

select * from finish();
rollback;
