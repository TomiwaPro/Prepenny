-- Step 3c fix (D351): a person owns one plan at most. A second plan of their
-- own is refused ("has-a-plan"), whoever asks, while being in someone else's
-- plan doesn't count. An account that already has two, from before this
-- rule, keeps both until the person chooses, and either can be removed.
-- Two phones asking at the same moment are tried in e2e/your-plan.spec.ts,
-- against the local Supabase's own Data API.

begin;
create extension if not exists pgtap with schema extensions;

select plan(14);

select tests.make_jess_and_tom('editor');

-- Alex has no plan yet. He makes one, and asking again changes nothing.
select tests.as_person('alex');
select lives_ok($$ select public.start_plan(tests.id('alex-plan'), 'scotland') $$,
  'Alex makes a plan of his own');
select lives_ok($$ select public.start_plan(tests.id('alex-plan'), 'scotland') $$,
  'and asking again for the same plan changes nothing');

-- A second plan of his own is refused, with a short code only.
select throws_ok($$ select public.start_plan(tests.id('alex-plan-2'), null) $$, 'P0001', 'has-a-plan',
  'A second plan of his own is refused');
select tests.as_test();
select is((select count(*) from public.plans where owner = tests.id('alex')), 1::bigint,
  'so he owns one plan');
select is((select count(*) from public.plan_members where person_id = tests.id('alex') and role = 'owner'),
  1::bigint, 'and is the owner of one plan only');

-- Once he removes it, he can make another.
select tests.as_person('alex');
select lives_ok($$ select public.remove_plan(tests.id('alex-plan')) $$, 'He removes his plan');
select lives_ok($$ select public.start_plan(tests.id('alex-plan-2'), null) $$,
  'and can then make another');

-- Being in someone else's plan doesn't count: Tom, who can edit Jess's
-- plan, makes one of his own, but not two.
select tests.as_person('tom');
select lives_ok($$ select public.start_plan(tests.id('tom-plan'), null) $$,
  'Tom, in Jess''s plan, still makes one of his own');
select throws_ok($$ select public.start_plan(tests.id('tom-plan-2'), null) $$, 'P0001', 'has-a-plan',
  'but not a second');

-- Not even the database itself, writing for Jess, gives her a second plan.
select tests.writing_as('jess');
select throws_ok($$ insert into public.plans (id) values (tests.id('jess-plan-2')) $$, 'P0001', 'has-a-plan',
  'Nothing gives Jess a second plan of her own');

-- The rule runs after the owner is filled in from who's asking (triggers run in name order).
select ok('one_plan_each' > 'before_write' and 'one_plan_each' > 'a0_only_through_save_edit',
  'The rule runs once the owner is filled in');

-- An account with two plans from before this rule: both can still be read,
-- and removing one leaves the other, whole.
select tests.as_test();
alter table public.plans disable trigger one_plan_each;
select tests.writing_as('alex');
insert into public.plans (id) values (tests.id('alex-old-plan'));
select tests.as_test();
alter table public.plans enable trigger one_plan_each;
select tests.as_person('alex');
select is((select count(*) from public.plan_members where person_id = tests.id('alex') and role = 'owner'
    and left_at is null), 2::bigint,
  'An account from before the rule can have two plans of its own');
select lives_ok($$ select public.remove_plan(tests.id('alex-old-plan')) $$,
  'and once the person chooses, the other is removed');
select lives_ok($$ select public.plan_changes(tests.id('alex-plan-2'), 0, 0) $$,
  'leaving the one kept, which still comes down');

select * from finish();
rollback;
