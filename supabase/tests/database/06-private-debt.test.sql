-- Test 6 (D65, PLAN.md item 5): a debt private to Jess is never readable by
-- Tom, and a payment to it from the joint account shows no link to it. The
-- same holds for a savings goal of hers kept in the joint account.

begin;
create extension if not exists pgtap with schema extensions;

select plan(15);

select tests.make_jess_and_tom('editor');

select tests.in_an_edit('tom');

select is_empty($$ select id from public.debts $$, 'Tom can''t read Jess''s private card');
select is_empty($$ select * from tests.rows_naming(array[tests.id('jess-card')::text]) $$,
  'No row Tom can read names her card, in any table');
select is((select count(*) from public.series where id = tests.id('joint-card-payment') and debt_id is null), 1::bigint,
  'Tom sees the payment to it from the joint account, with no debt linked');
select is((select count(*) from public.ticks where id = tests.id('joint-card-tick') and in_debt_update is null), 1::bigint,
  'Tom sees that payment ticked, with nothing about her card''s statement');
select is_empty($$ select id from public.private_links $$, 'Tom can''t read the links Jess keeps to herself');
select is_empty($$ select id from public.goals where id = tests.id('jess-surprise') $$,
  'Tom can''t read her own savings goal kept in the joint account');
select is((select count(*) from public.series where id = tests.id('joint-saving') and goal_id is null), 1::bigint,
  'Tom sees the money moving into it, with no goal linked');

select throws_ok($$ insert into public.private_links (id, plan_id, family_id, debt_id)
  values (gen_random_uuid(), tests.id('plan'), tests.id('rent'), tests.id('jess-card')) $$,
  '42501', null, 'Tom can''t link a payment to her card');
select throws_ok($$ update public.series set debt_id = tests.id('jess-card') where id = tests.id('rent') $$,
  '42501', null, 'Tom can''t link the rent to her card either');

-- Jess sees her card and the link, and the database keeps the link off the
-- shared payment itself.
select tests.in_an_edit('jess');

select is((select debt_id from public.private_links where family_id = tests.id('joint-card-payment')),
  tests.id('jess-card'), 'Jess reads the link from the joint payment to her card');
select is((select in_debt_update from public.private_links where tick_id = tests.id('joint-card-tick')),
  tests.id('jess-card'), 'Jess reads that its tick was made inside her card''s statement update');
select is((select goal_id from public.private_links where family_id = tests.id('joint-saving')),
  tests.id('jess-surprise'), 'Jess reads the link to her savings goal');
select throws_ok($$ update public.series set debt_id = tests.id('jess-card') where id = tests.id('joint-card-payment') $$,
  'P0001', 'link-to-private', 'The shared payment itself can''t name her private card');
select throws_ok($$ insert into public.ticks (id, plan_id, series_id, original_date, payment_number, paid_on, ticked_at,
    in_debt_update)
  values (gen_random_uuid(), tests.id('plan'), tests.id('joint-card-payment'), '2026-12-01', 1, '2026-12-01',
    '2026-12-01T09:00:00Z', tests.id('jess-card')) $$,
  'P0001', 'link-to-private', 'Nor can a shared tick');
select is((select count(*) from public.series where id = tests.id('jess-card-payment')
  and debt_id = tests.id('jess-card')), 1::bigint,
  'A payment from her own private account names her card as usual');

select * from finish();
rollback;
