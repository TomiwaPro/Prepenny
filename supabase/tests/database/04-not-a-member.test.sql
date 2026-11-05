-- Test 4: someone who isn't a member of the plan can read nothing in it,
-- and nor can someone who has left it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(10);

select tests.make_jess_and_tom('editor');

-- Alex has a sign-in and a session, but isn't in the plan.
select tests.as_person('alex');

select set_eq($$ select * from tests.readable_rows() $$, array['people:' || tests.id('alex')],
  'Alex reads nothing in any table but his own person');
select is(tests.change_rows(tests.all_ids()), 0::bigint, 'Alex can''t change anything in the plan');
select is(tests.remove_rows(tests.all_ids()), 0::bigint, 'Alex can''t remove anything in it');
select throws_ok($$ insert into public.accounts (id, plan_id, name, kind, warning_level)
  values (gen_random_uuid(), tests.id('plan'), 'Mine', 'current', 0) $$,
  '42501', null, 'Alex can''t add an account to the plan');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), '2026-12-01', 1, '2026-12-01', '2026-12-01T09:00:00Z') $$,
  '42501', null, 'Alex can''t tick a payment in it');
select throws_ok($$ insert into public.plan_members (plan_id, person_id, role)
  values (tests.id('plan'), tests.id('alex'), 'editor') $$,
  '42501', null, 'Alex can''t add himself to the plan');
select throws_ok($$ insert into public.settings (id, plan_id) values (gen_random_uuid(), tests.id('plan')) $$,
  '42501', null, 'Alex can''t keep settings of his own in it');
select set_eq($$ select app.my_plans() $$, array[]::uuid[], 'Alex is in no plan');

-- Tom leaves the plan (brief 4.14): from then on he reads nothing in it.
select tests.as_test();
update public.plan_members set left_at = now() where person_id = tests.id('tom');
select tests.as_person('tom');

select set_eq($$ select * from tests.readable_rows() $$, array['people:' || tests.id('tom')],
  'Once Tom has left, he reads nothing in the plan, not even its shared records');
select is(tests.change_rows(tests.all_ids()), 0::bigint, 'Once Tom has left, he can''t change anything in it');

select * from finish();
rollback;
