-- Step 3c: saving a change on the server (save_edit, ARCHITECTURE.md 3.5) and
-- bringing a plan down (plan_changes), with the owner's five tests:
-- 1. someone who isn't in a plan can't read it or save anything to it;
-- 2. "Can view only" can't save shared changes, apart from their own pay
--    (D311, D319): in 13-save-edit-view-only.test.sql;
-- 3. a partner's phone never receives private records or job details, only
--    what D303 allows;
-- 4. the same edit sent twice changes nothing;
-- 5. an edit made on an older version is refused cleanly.
-- And every check the helpers with the database's own rights make (D324).

begin;
create extension if not exists pgtap with schema extensions;

select plan(54);

select tests.make_jess_and_tom('editor');

-- A rent change as the phone sends it: the whole row, at the version it saw.
create function tests.rent_row(amount bigint) returns jsonb language sql as $$
  select jsonb_build_object('account_id', tests.id('joint'), 'name', 'Rent', 'direction', 'out', 'type', 'rent',
    'amount', amount, 'start_date', '2026-11-01',
    'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}'::jsonb,
    'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'family_id', tests.id('rent'),
    'family_created_at', '2026-10-25T08:31:00Z', 'is_estimate', false)
$$;
create function tests.rent_write(amount bigint, version integer) returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object('table', 'series', 'id', tests.id('rent'), 'version', version,
    'row', tests.rent_row(amount)))
$$;
create function tests.save(edit text, writes jsonb) returns jsonb language sql as $$
  select public.save_edit(tests.id('plan'), tests.id(edit), '2026-11-07T10:00:00Z', 'just-this-one', writes)
$$;
grant execute on all functions in schema tests to authenticated;

-- ---------------------------------------------------------------------------
-- Saving, and what it fills in.

select tests.as_person('jess');
select is(tests.save('jess-rent-1', tests.rent_write(112000, 1)) ->> 'saved', 'new',
  'Jess saves a change to the shared rent');
select is((select amount::bigint from public.series where id = tests.id('rent')), 112000::bigint,
  'The rent is changed');
select is((select version from public.series where id = tests.id('rent')), 2, 'Its version goes up by 1');
select is((select edit_id from public.series where id = tests.id('rent')), tests.id('jess-rent-1'),
  'It names the edit that saved it, filled in by the database');
select is((select person_id from public.edits where id = tests.id('jess-rent-1')), tests.id('jess'),
  'The edit is in the history as Jess''s, written by the server (D296)');
select is((select private_to from public.edits where id = tests.id('jess-rent-1')), null::uuid,
  'An edit that changed something shared is shared');

-- 4. The same edit sent twice changes nothing.
select is(tests.save('jess-rent-1', tests.rent_write(999999, 1)) ->> 'saved', 'already',
  'Sent again, the same edit is "already" saved');
select is((select amount::bigint from public.series where id = tests.id('rent')), 112000::bigint,
  'and changes nothing: the rent is as the first time');
select is((select version from public.series where id = tests.id('rent')), 2, 'nor its version');
select is((select count(*) from public.edits where id = tests.id('jess-rent-1')), 1::bigint,
  'and the history holds it once');
select is((tests.save('jess-rent-1', tests.rent_write(999999, 1)) -> 'rows' -> 0 ->> 'version')::integer, 2,
  'The phone hears the version as it is now, so it can carry on');

-- 5. An edit made on an older version is refused cleanly.
select throws_ok($$ select tests.save('jess-rent-old', tests.rent_write(1, 1)) $$,
  'P0001', 'changed-since', 'A change made on version 1, now that it''s 2, is refused as changed since');
select is((select amount::bigint from public.series where id = tests.id('rent')), 112000::bigint,
  'and nothing of it is saved');
select is((select count(*) from public.edits where id = tests.id('jess-rent-old')), 0::bigint,
  'not even in the history, so the phone can send it again once it has looked again (step 3d)');
select throws_ok($$ select tests.save('jess-two-things', jsonb_build_array(
    jsonb_build_object('table', 'accounts', 'id', tests.id('joint'), 'version', 1,
      'row', jsonb_build_object('name', 'Joint bills', 'kind', 'joint', 'warning_level', 2000)),
    tests.rent_write(5, 1) -> 0)) $$,
  'P0001', 'changed-since', 'One record out of date refuses the whole edit');
select is((select name from public.accounts where id = tests.id('joint')), 'Joint',
  'so the record that was up to date isn''t changed either');
select throws_ok($$ select tests.save('jess-new-rent', jsonb_build_array(jsonb_build_object(
    'table', 'series', 'id', tests.id('rent'), 'version', null, 'row', tests.rent_row(1)))) $$,
  'P0001', 'changed-since', 'Making a record that''s there already is changed since too');

-- Removing marks it removed, so every phone hears.
select is(tests.save('jess-remove-food', jsonb_build_array(jsonb_build_object('table', 'budgets',
    'id', tests.id('joint-food'), 'version', 1, 'row', null))) ->> 'saved', 'new',
  'Jess removes the joint food budget');
select is((select deleted from public.budgets where id = tests.id('joint-food')), true,
  'It''s marked removed, not deleted');

-- An edit of private things only stays private, so nothing shows when she was busy (D299).
select is(tests.save('jess-private', jsonb_build_array(jsonb_build_object('table', 'accounts',
    'id', tests.id('jess-current'), 'version', 1,
    'row', jsonb_build_object('name', 'Jess current', 'kind', 'current', 'warning_level', 5000,
      'private_to', tests.id('jess'), 'belongs_to', tests.id('jess'))))) ->> 'saved', 'new',
  'Jess changes her private account');
select is((select private_to from public.edits where id = tests.id('jess-private')), tests.id('jess'),
  'That edit is private to her');

-- A refusal never says what a record holds (CLAUDE.md).
select throws_ok($$ select tests.save('jess-bad', jsonb_build_array(jsonb_build_object('table', 'budgets',
    'id', tests.id('new-budget'), 'version', null, 'row', jsonb_build_object('account_id', tests.id('joint'),
    'name', 'Secret name', 'amount', -5, 'every', 'week', 'leaves', 'at-start', 'starts_on', '2026-11-01',
    'made_at', '2026-11-07T10:00:00Z')))) $$,
  'P0001', 'bad-record', 'A record the database refuses comes back as "bad-record", with no name or amount');
select throws_ok($$ select tests.save('jess-odd', '[{"table":"auth.users","id":"00000000-0000-0000-0000-000000000001","version":1,"row":{}}]') $$,
  'P0001', 'bad-edit', 'Only PrePenny''s own tables can be written');
select throws_ok($$ select public.save_edit(tests.id('plan'), tests.id('jess-kind'), '2026-11-07T10:00:00Z',
    'Drop table', '[]') $$, 'P0001', 'bad-edit', 'The kind of edit is a short code');

-- The engine's family rules (PLAN.md item 27).
select throws_ok($$ select tests.save('jess-two-firsts', jsonb_build_array(jsonb_build_object('table', 'series',
    'id', tests.id('rent-later'), 'version', null, 'row', tests.rent_row(1) || jsonb_build_object('split_from',
    tests.id('rent'), 'first_number', 0, 'start_date', '2027-01-01')))) $$,
  'P0001', 'family-broken', 'Two series of one family can''t hold the same payment number');
select throws_ok($$ select tests.save('jess-rent-early', jsonb_build_array(jsonb_build_object('table', 'series',
    'id', tests.id('rent-later'), 'version', null, 'row', tests.rent_row(1) || jsonb_build_object('split_from',
    tests.id('rent'), 'first_number', 2, 'start_date', '2027-01-01')))) $$,
  'P0001', 'family-broken', 'A series split from one that never ends is refused: the first must end before it');
select lives_ok($$ select tests.save('jess-rent-split', jsonb_build_array(
    jsonb_build_object('table', 'series', 'id', tests.id('rent'), 'version',
      (select version from public.series where id = tests.id('rent')),
      'row', tests.rent_row(112000) || '{"end_rule":{"kind":"on","date":"2026-12-31"}}'::jsonb),
    jsonb_build_object('table', 'series', 'id', tests.id('rent-later'), 'version', null,
      'row', tests.rent_row(56000) || jsonb_build_object('split_from', tests.id('rent'), 'first_number', 2,
        'start_date', '2027-01-01')))) $$,
  'A proper split for this and all later ones is saved');

-- ---------------------------------------------------------------------------
-- 3. What each person's phone brings down.

select tests.as_person('tom');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows')
    r where r -> 'row' ->> 'id' = any (tests.private_ids('jess'))), 0::bigint,
  'Tom''s phone brings down no record that''s private to Jess');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where exists (select 1 from jsonb_path_query(r, 'strict $.**') v
      where jsonb_typeof(v) = 'string' and v #>> '{}' = any (tests.private_ids('jess')))), 0::bigint,
  'nor any record that names one');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r ->> 'table' in ('pay_profiles', 'pay_weeks', 'pay_adjustment_details', 'private_links', 'settings')
      and r -> 'row' ->> 'private_to' is distinct from tests.id('tom')::text), 0::bigint,
  'nor anyone else''s job, usual weeks, overtime details, private links or settings (D303)');
select is((select r -> 'row' ->> 'change' from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = tests.id('jess-cafe-overtime')::text), '2175',
  'He gets the change Jess''s overtime makes to her shared pay, as an amount only (D303)');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = tests.id('jess-cafe-overtime')::text
      and (r -> 'row') ?| array['hours', 'rate', 'worked_on', 'kind']), 0::bigint,
  'with no hours, rate, day or kind');
select ok((select bool_and(r -> 'row' ->> 'private_to' is null or r -> 'row' ->> 'private_to' = tests.id('tom')::text)
    from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r),
  'Every record he gets is shared or his own');
select ok((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' in (tests.id('rent')::text, tests.id('joint')::text, tests.id('tom-current')::text)) = 3,
  'He gets the shared rent, the joint account and his own account');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = tests.id('joint-food')::text and (r -> 'row' ->> 'deleted')::boolean), 1::bigint,
  'A removed record comes down marked removed');
select is((select count(*) from public.edits where id = tests.id('jess-private')), 0::bigint,
  'He can''t see that Jess''s private edit exists');
select is(jsonb_array_length(public.plan_changes(tests.id('plan'), 1000000, 1000000) -> 'rows'), 0,
  'After the newest change numbers, there''s nothing more to bring down');

select tests.as_person('jess');
select ok((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = any (tests.private_ids('jess'))) = array_length(tests.private_ids('jess'), 1),
  'Jess''s own phone brings down every one of her private records, links and job details included');
select is((select count(*) from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
    where r -> 'row' ->> 'id' = any (tests.private_ids('tom'))), 0::bigint,
  'and nothing private to Tom');

-- ---------------------------------------------------------------------------
-- 1. Someone who isn't in the plan.

select tests.as_person('alex');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', null,
  'Alex, who isn''t in the plan, can''t bring it down');
select throws_ok($$ select tests.save('alex-rent', tests.rent_write(1, 3)) $$, '42501', null,
  'nor save anything to it');
select throws_ok($$ select app.begin_edit(tests.id('plan'), tests.id('alex-edit'), '2026-11-07T10:00:00Z', 'tick') $$,
  '42501', null, 'nor start an edit in its history');
select throws_ok($$ select app.nudge(tests.id('plan'), true) $$, '42501', null, 'nor nudge its phones');
select throws_ok($$ select public.remove_plan(tests.id('plan')) $$, '42501', null, 'nor remove it');
select throws_ok($$ select public.start_plan(tests.id('plan'), 'scotland') $$, '42501', null,
  'nor make a plan with its id');
select throws_ok($$ select tests.save('jess-rent-1', tests.rent_write(1, 3)) $$, '42501', null,
  'nor pass off one of Jess''s edits as his');
select is(app.may_hear('plan:' || tests.id('plan')), false, 'nor hear its nudges');

-- His own plan works, and he can remove it while he's alone in it.
select lives_ok($$ select public.start_plan(tests.id('alex-plan'), 'scotland') $$, 'Alex makes a plan of his own');
select lives_ok($$ select public.start_plan(tests.id('alex-plan'), 'scotland') $$,
  'and asking again changes nothing');
select is(app.may_hear('plan:' || tests.id('alex-plan') || ':' || tests.id('alex')), true,
  'He hears his own plan''s private nudges');
select lives_ok($$ select public.remove_plan(tests.id('alex-plan')) $$, 'He removes his plan');
select is((select count(*) from public.plans where id = tests.id('alex-plan')), 0::bigint, 'and it''s gone');

-- The owner can't remove a plan someone else is in, and nobody else can remove it.
select tests.as_person('tom');
select throws_ok($$ select public.remove_plan(tests.id('plan')) $$, '42501', null,
  'Tom, who can edit but doesn''t own the plan, can''t remove it');
select tests.as_person('jess');
select throws_ok($$ select public.remove_plan(tests.id('plan')) $$, 'P0001', 'shared-plan',
  'Jess can''t remove the plan while Tom is in it');

select * from finish();
rollback;
