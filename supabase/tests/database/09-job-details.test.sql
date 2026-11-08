-- The owner's answer to step 3a's question 3 (D303): job details stay
-- private to their person, even when their pay lands in a shared account.
-- Jess's cafe job pays into the joint account. Tom sees the pay, and the
-- change her overtime makes to it, as amounts only: never the tax code, the
-- pension, the usual week, the hours or the rate. Only Jess can add overtime
-- or a missed shift to her own pay. No shared record names a private one.

begin;
create extension if not exists pgtap with schema extensions;

select plan(25);

select tests.make_jess_and_tom('editor');

-- As Tom, who can edit the shared plan.
select tests.in_an_edit('tom');

-- What Tom reads: the pay, and the overtime as an amount.
select is((select amount::bigint from public.series where id = tests.id('jess-cafe-pay')), 9000::bigint,
  'Tom reads Jess''s pay arriving in the joint account, with its amount');
select is((select paid_to from public.series where id = tests.id('jess-cafe-pay')), tests.id('jess'),
  'He reads that it''s Jess''s pay');
select is((select change::bigint from public.pay_adjustments where id = tests.id('jess-cafe-overtime')), 2175::bigint,
  'He reads the change her overtime makes to that payday, as an amount');

-- What he never reads.
select is_empty($$ select * from tests.rows_naming(array[tests.id('jess-cafe-job'), tests.id('jess-cafe-week'),
    tests.id('jess-cafe-pay-job'), tests.id('jess-cafe-overtime-details')]::text[]) $$,
  'No row Tom can read is, or names, her job, its usual week, its link to the pay or the overtime''s details');
select is_empty($$ select id from public.pay_profiles $$,
  'Tom reads no job details of Jess''s at all: no tax code or pension');
select is_empty($$ select id from public.pay_weeks $$,
  'Nor her usual weeks, with their hours and rates');
select is_empty($$ select id from public.pay_adjustment_details $$,
  'Nor what the overtime was, its day, its hours or its rate');
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'pay_adjustments'
       and column_name in ('kind', 'worked_on', 'hours', 'rate', 'extras', 'tax_year') $$,
  'The overtime''s change to a payday, which a partner can read, has no place for hours, a rate or a day');
select is_empty(
  $$ select column_name from information_schema.columns
     where table_schema = 'public' and table_name = 'series'
       and column_name in ('tax_code', 'pension_percent', 'overtime_rate') $$,
  'Nor does a payment have any place for job details');

-- Only Jess can add overtime or a missed shift to her own pay.
select throws_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), 2, 3000) $$,
  'P0001', 'not-your-pay', 'Tom can''t add overtime to Jess''s pay in the joint account');
select throws_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), 2, -3000) $$,
  'P0001', 'not-your-pay', 'Nor a missed shift');
select is(tests.change_rows(array[tests.id('jess-cafe-overtime')::text]), 0::bigint,
  'He can''t change the overtime she added');
select is(tests.remove_rows(array[tests.id('jess-cafe-overtime')::text]), 0::bigint,
  'Nor remove it');
select throws_ok($$ insert into public.pay_adjustment_details (id, plan_id, adjustment_id, kind, worked_on, hours, rate,
    tax_year)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-overtime'), 'overtime', '2026-11-22', '9', '99',
    '2026-27') $$,
  'P0001', 'not-your-pay', 'Nor give it details of his own');
select throws_ok($$ insert into public.private_links (id, plan_id, series_id, pay_profile_id)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), tests.id('jess-cafe-job')) $$,
  '42501', null, 'He can''t link her pay to her job, which he can''t see');
insert into public.pay_profiles (id, plan_id, name, frequency, tax_code, basis)
values (tests.id('tom-job'), tests.id('plan'), 'Garage', 'monthly', '1257L', 'cumulative');
select throws_ok($$ insert into public.private_links (id, plan_id, series_id, pay_profile_id)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), tests.id('tom-job')) $$,
  'P0001', 'not-your-pay', 'Nor link her pay to a job of his own, to work out overtime on it');

-- Nobody can say a payment is someone else's pay.
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, paid_to)
  values (tests.id('tom-says-jess'), tests.id('plan'), tests.id('joint'), 'Jess bonus', 'in', 'pay', 100, '2026-12-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-says-jess'), '2026-10-26T09:00:00Z', tests.id('jess')) $$,
  '42501', null, 'Tom can''t add pay to the joint account as if it were Jess''s');

-- What Tom can still do with the shared pay, as with anything shared.
select lives_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('jess-cafe-pay'), '2026-11-01', 0, '2026-11-01',
    '2026-11-01T09:00:00Z') $$,
  'Tom can mark her pay as arrived in the joint account');
select lives_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number, paid_to)
  values (tests.id('jess-cafe-pay-later'), tests.id('plan'), tests.id('joint'), 'Jess cafe pay', 'in', 'pay', 9500,
    '2027-01-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
    tests.id('jess-cafe-pay'), '2026-10-25T08:31:00Z', tests.id('jess-cafe-pay'), 2, tests.id('jess')) $$,
  'A new amount from Tom for this and all later ones keeps it Jess''s pay');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number)
  values (tests.id('jess-cafe-pay-unpaid'), tests.id('plan'), tests.id('joint'), 'Jess cafe pay', 'in', 'pay', 9500,
    '2027-02-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
    tests.id('jess-cafe-pay'), '2026-10-25T08:31:00Z', tests.id('jess-cafe-pay'), 3) $$,
  'P0001', 'family-mixed', 'But can''t split it into pay that isn''t hers');

-- As Jess.
select tests.in_an_edit('jess');

select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, paid_to, pay_profile_id)
  values (tests.id('named-job'), tests.id('plan'), tests.id('joint'), 'Cafe', 'in', 'pay', 100, '2026-12-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('named-job'), '2026-10-26T09:00:00Z', tests.id('jess'),
    tests.id('jess-cafe-job')) $$,
  'P0001', 'link-to-private', 'Not even Jess can make a shared payment name her job: it goes in her private link');
select lives_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (tests.id('jess-cafe-missed'), tests.id('plan'), tests.id('jess-cafe-pay'), 3, -9000) $$,
  'Jess can add a missed shift to her own pay in the joint account');
select is((select locked_to from public.pay_adjustments where id = tests.id('jess-cafe-missed')), tests.id('jess'),
  'It''s locked to her, so only she can change it');
select lives_ok($$ insert into public.pay_profiles (id, plan_id, name, frequency, tax_code, basis)
  values (tests.id('jess-third-job'), tests.id('plan'), 'Weekend job', 'weekly', '1257L', 'cumulative') $$,
  'Jess can add another job without saying who it''s private to');
select is((select private_to from public.pay_profiles where id = tests.id('jess-third-job')), tests.id('jess'),
  'A job is always private to the person who added it');

select * from finish();
rollback;
