-- What the outside review of step 3a found, each now refused (D299): a
-- record can name only records in its own plan, a payment joins only its own
-- family, Jess's private changes leave no gap in the shared change numbers,
-- a shared record never names a private edit, and nobody can say an account
-- is someone else's.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

select tests.make_jess_and_tom('viewer');

-- Tom, who can only view Jess's plan, makes a plan of his own.
select tests.as_person('tom');
insert into public.plans (id, name) values (tests.id('tom-plan'), 'Mine');

select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('tom-plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Tom can''t tick Jess''s rent from his own plan');
select throws_ok($$ insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount)
  values (gen_random_uuid(), tests.id('tom-plan'), tests.id('rent'), '2027-01-01', 2, 1) $$,
  '42501', null, 'Nor change it from there');
select throws_ok($$ insert into public.spends (id, plan_id, budget_id, amount, spent_on, recorded_at)
  values (gen_random_uuid(), tests.id('tom-plan'), tests.id('joint-food'), 100, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Nor record a spend on the joint food budget from there');
select throws_ok($$ insert into public.balance_updates (id, plan_id, account_id, balance, checked_on, checked_at)
  values (gen_random_uuid(), tests.id('tom-plan'), tests.id('joint'), 1, '2026-10-26', '2026-10-26T09:00:00Z') $$,
  '42501', null, 'Nor update the joint account''s balance from there');
select throws_ok($$ insert into public.pay_adjustments (id, plan_id, family_id, payment_number, change)
  values (gen_random_uuid(), tests.id('tom-plan'), tests.id('rent'), 1, 1) $$,
  '42501', null, 'Nor add overtime to a payment of Jess''s plan from there');

-- So Jess can still tick and change her rent, as the owner.
select tests.as_person('jess');
select lives_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  'Jess can still tick her rent');

-- A payment joins only its own family (D49).
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from)
  values (tests.id('jess-in-rent'), tests.id('plan'), tests.id('jess-current'), 'Rent', 'out', 'rent', 1, '2027-06-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('rent'), '2026-10-25T08:31:00Z', tests.id('rent')) $$,
  'P0001', 'family-mixed', 'A payment on another account can''t join the rent''s family');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from)
  values (tests.id('unlocked-from-jess'), tests.id('plan'), tests.id('joint'), 'From Jess', 'in', 'savings', 1,
    '2026-12-28', '{"kind":"once"}', '{"kind":"never"}', 'keep', tests.id('from-jess'), '2026-10-25T08:31:00Z',
    tests.id('from-jess')) $$,
  'P0001', 'family-mixed', 'An unlocked payment can''t join "From Jess", even from Jess');
select throws_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at)
  values (tests.id('made-up-family'), tests.id('plan'), tests.id('joint'), 'Odd', 'out', 'other', 1, '2027-06-01',
    '{"kind":"once"}', '{"kind":"never"}', 'keep', gen_random_uuid(), '2026-10-25T08:31:00Z') $$,
  'P0001', 'family-mixed', 'A new payment starts a family of its own, never one that isn''t there');
select lives_ok($$ insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number)
  values (tests.id('rent-split'), tests.id('plan'), tests.id('joint'), 'Rent', 'out', 'rent', 56000, '2027-01-01',
    '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep', tests.id('rent'),
    '2026-10-25T08:31:00Z', tests.id('rent'), 2) $$,
  'A split of the rent joins its family, as "this and all later ones" does');

-- Jess's private changes leave no gap in the change numbers Tom can see.
select tests.as_test();
update public.series set note = 'Due on the 1st' where id = tests.id('rent');
create temporary table seen_before as select seq from public.series where id = tests.id('rent');
grant select on seen_before to authenticated;
select tests.as_person('jess');
update public.balance_updates set expected = 1 where id = tests.id('jess-balance');
update public.balance_updates set expected = 2 where id = tests.id('jess-balance');
update public.spends set note = 'Lunch' where id = tests.id('jess-spend');
select tests.as_test();
update public.series set note = 'Due on the 1st, by standing order' where id = tests.id('rent');
select tests.as_person('tom');
select is((select seq from public.series where id = tests.id('rent')) - (select seq from seen_before), 1::bigint,
  'Between two shared changes, Jess''s three private ones leave no gap Tom can see');

-- A shared record never names a private edit (D291).
select tests.as_test();
insert into public.edits (id, plan_id, private_to, person_id, made_at, kind)
  values (tests.id('jess-private-edit'), tests.id('plan'), tests.id('jess'), tests.id('jess'),
    '2026-10-26T09:00:00Z', 'update-balance');
insert into public.edits (id, plan_id, person_id, made_at, kind)
  values (tests.id('jess-shared-edit'), tests.id('plan'), tests.id('jess'), '2026-10-26T09:00:00Z', 'this-and-later');
select tests.as_person('jess');
select throws_ok($$ update public.series set edit_id = tests.id('jess-private-edit') where id = tests.id('rent') $$,
  '42501', null, 'The shared rent can''t name an edit only Jess can read');
select lives_ok($$ update public.series set edit_id = tests.id('jess-shared-edit') where id = tests.id('rent') $$,
  'It names a shared edit as usual');
select lives_ok($$ update public.balance_updates set edit_id = tests.id('jess-private-edit')
    where id = tests.id('jess-balance') $$,
  'And her private balance update names her private edit');

-- Nobody can say an account is someone else's.
select tests.as_person('tom');
select throws_ok($$ insert into public.accounts (id, plan_id, name, kind, warning_level, belongs_to)
  values (gen_random_uuid(), tests.id('tom-plan'), 'Hers', 'current', 0, tests.id('jess')) $$,
  '42501', null, 'Tom can''t make an account that says it''s Jess''s');

select * from finish();
rollback;
