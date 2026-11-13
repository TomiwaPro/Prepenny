-- Rows locked to someone else can't be changed (D16, D293), and what the
-- database fills in itself can't be set by a phone (ARCHITECTURE.md 3.1 and
-- 3.6, D288, D290).

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select tests.make_jess_and_tom('editor');

-- "From Jess", the £600 arriving in the joint account, is locked to Jess.
select tests.in_an_edit('tom');

select is(tests.change_rows(array[tests.id('from-jess')::text]), 0::bigint,
  'Tom can''t change "From Jess", which is locked to Jess');
select is(tests.remove_rows(array[tests.id('from-jess')::text, tests.id('from-jess-tick')::text]), 0::bigint,
  'Tom can''t remove it, or untick it');
select throws_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('plan'), tests.id('from-jess'), '2026-11-28', 1, 1) $$,
  '42501', null, 'Tom can''t change one of its payments');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, locked_to)
  values (tests.id('tom-locked'), tests.id('plan'), tests.id('joint'), 'From Tom', 'in', 'savings', 100,
    '2026-11-01', '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('tom-locked'), '2026-10-26T09:00:00Z',
    tests.id('jess')) $$,
  '42501', null, 'Tom can''t lock a payment to Jess');

-- Who changed a record is always who really did.
update public.series set note = 'Ours', changed_by = tests.id('jess'), version = 99, seq = 0
  where id = tests.id('rent');
select tests.as_test();
select is((select changed_by from public.series where id = tests.id('rent')), tests.id('tom'),
  '"Changed by Tom" is set by the database, even when a phone says Jess');
select is((select version from public.series where id = tests.id('rent')), 2,
  'The version goes up by 1 on every save, whatever a phone sends');
select ok((select seq from public.series where id = tests.id('rent'))
    > (select max(seq) from public.accounts where plan_id = tests.id('plan')),
  'The save gets the plan''s next change number');
select is((select created_by from public.series where id = tests.id('rent')), tests.id('jess'),
  'Who made it stays as it was');

-- Privacy is filled in from the account, whatever a phone sends.
select tests.in_an_edit('jess');
insert into public.ticks (id, plan_id, private_to, series_id, original_date, payment_number, paid_on, ticked_at)
  values (tests.id('jess-new-tick'), tests.id('plan'), null, tests.id('jess-pay'), '2026-12-01', 1, '2026-12-01',
    '2026-12-01T09:00:00Z');
select is((select private_to from public.ticks where id = tests.id('jess-new-tick')), tests.id('jess'),
  'A tick on Jess''s private payment is private to her, even sent as shared');
select is((select ticked_by from public.ticks where id = tests.id('jess-new-tick')), tests.id('jess'),
  'And it says who ticked it');
select throws_ok($$ update public.accounts set private_to = null where id = tests.id('jess-current') $$,
  'P0001', 'sharing-comes-later', 'Sharing a private account waits for shared plans in step 3f');
select throws_ok($$ insert into public.accounts (id, plan_id, private_to, name, kind, warning_level, belongs_to)
  values (gen_random_uuid(), tests.id('plan'), tests.id('tom'), 'His', 'current', 0, tests.id('tom')) $$,
  '42501', null, 'Jess can''t make an account private to Tom');
select throws_ok($$ insert into public.series (id, plan_id, account_id, to_account_id, name, direction, type, amount,
    start_date, schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('jess-move'), tests.id('plan'), tests.id('jess-current'), tests.id('joint'), 'Move', 'transfer',
    'savings', 100, '2026-11-01', '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('jess-move'),
    '2026-10-26T09:00:00Z') $$,
  'P0001', 'private-transfer-needs-halves',
  'Money from her private account to the joint one is two linked halves, never one shared payment (D16)');
select throws_ok($$ update public.series set note = 'My savings' where id = tests.id('from-jess') $$,
  'P0001', 'shared-half', '"From Jess" carries no note of its own, even from Jess');
select throws_ok($$ update public.series set account_id = tests.id('joint') where id = tests.id('jess-pay') $$,
  'P0001', 'fixed-field', 'A payment can''t move from her private account to a shared one');

-- Settings are always the person's own.
insert into public.settings (id, plan_id, private_to) values (gen_random_uuid(), tests.id('plan'), null)
  on conflict do nothing;
select is((select count(*) from public.settings where private_to is null), 0::bigint,
  'Settings are always private to their person');

select * from finish();
rollback;
