-- Step 4a: a shared budget leaves on the payday of the person who added it,
-- on both phones (D508); the other person's phone gets that person's
-- paydays, the dates only (D512, D514); when they leave, it follows the
-- person who stays (D513); and GraphQL is switched off (D509).
--
-- Proves what the owner asked: a partner never receives anything about the
-- other's pay but its dates, whatever the pay's owner changes; nobody but
-- the database writes those dates; and they go once nothing needs them.

begin;
create extension if not exists pgtap with schema extensions;

select plan(77);

select tests.make_jess_and_tom();
-- The paydays are worked out when a change is saved (deferred, D522). A test
-- is never saved, so here they're worked out as each statement ends.
set constraints all immediate;

-- A refusal's code, as the phone gets it.
create function pg_temp.refusal(statement text) returns text language plpgsql as $$
declare
  code text;
begin
  execute statement;
  return 'no refusal';
exception when others then
  get stacked diagnostics code = message_text;
  return code;
end;
$$;
grant execute on function pg_temp.refusal(text) to authenticated;

-- A person's change, in an edit, as save_edit makes it.
create function pg_temp.change(person text, statement text) returns void language plpgsql as $$
begin
  perform tests.in_an_edit(person);
  execute statement;
  perform tests.as_test();
end;
$$;

-- Jess's paydays as the person acting now reads them, live ones only, as JSON.
create function pg_temp.paydays_read() returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(p) - 'id' - 'plan_id' - 'version' - 'seq' - 'changed_at'
      order by p.first_number nulls first, p.start_date), '[]'::jsonb)
  from public.paydays p where not p.deleted and p.person = tests.id('jess')
$$;
grant execute on function pg_temp.paydays_read() to authenticated;

-- What plan_changes gives the person acting now of the paydays, as text.
create function pg_temp.paydays_sent() returns text language sql as $$
  select coalesce(jsonb_agg(r)::text, '')
  from jsonb_array_elements(public.plan_changes(tests.id('plan'), 0, 0) -> 'rows') r
  where r ->> 'table' = 'paydays'
$$;
grant execute on function pg_temp.paydays_sent() to authenticated;

-- Nudges, caught here instead of sent, for this test only (it's put back
-- when the test ends), as 13-save-edit-roles.test.sql does.
create table tests.nudges (topic text);
grant insert, select, delete on tests.nudges to authenticated;
create or replace function app.send_nudge(topic text) returns void
language sql security definer set search_path = '' as $$
  insert into tests.nudges (topic) values (topic)
$$;

-- ---------------------------------------------------------------------------
-- 1. Whose paydays a budget follows: the person who added it (D508).

select is((select follows_pay_of from public.budgets where id = tests.id('joint-food')), tests.id('jess'),
  'The joint account''s food month, added by Jess, follows Jess''s paydays');
select is((select follows_pay_of from public.budgets where id = tests.id('jess-food')), tests.id('jess'),
  'and so does the budget on her own account');

select pg_temp.change('tom', $$
  insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves, starts_on, made_at, follows_pay_of)
  values (tests.id('tom-travel'), tests.id('plan'), tests.id('joint'), 'Travel', 2500, 'week', 'at-start',
    '2026-10-25', '2026-10-25T09:00:00Z', tests.id('jess')) $$);
select is((select follows_pay_of from public.budgets where id = tests.id('tom-travel')), tests.id('tom'),
  'A budget Tom adds follows Tom''s, whatever his phone sends');

select pg_temp.change('tom', $$
  update public.budgets set follows_pay_of = tests.id('tom'), amount = 31000 where id = tests.id('joint-food') $$);
select is((select array[follows_pay_of::text, amount::text] from public.budgets where id = tests.id('joint-food')),
  array[tests.id('jess')::text, '31000'],
  'Tom can change Jess''s food month, but not whose paydays it follows');

-- ---------------------------------------------------------------------------
-- 2. The paydays table: the dates only, read by everyone in the plan,
-- written by nobody but the database.

select set_eq(
  $$ select column_name::text from information_schema.columns
     where table_schema = 'public' and table_name = 'paydays' $$,
  array['id', 'plan_id', 'version', 'seq', 'changed_at', 'deleted', 'person', 'start_date', 'schedule',
    'end_rule', 'holiday_rule', 'first_number', 'moved_from', 'moved_to', 'skipped'],
  'Paydays have dates and how often only: no amount, name, account, job, note or link'
);
select is((select relrowsecurity from pg_class where oid = 'public.paydays'::regclass), true,
  'Paydays have their privacy rules switched on');
select set_eq(
  $$ select privilege_type::text from information_schema.role_table_grants
     where table_schema = 'public' and table_name = 'paydays' and grantee in ('authenticated', 'anon', 'PUBLIC') $$,
  array['SELECT'],
  'A signed-in person can only read them');

select tests.as_person('tom');
select is(pg_temp.refusal($$ insert into public.paydays (id, plan_id, deleted) values (gen_random_uuid(), tests.id('plan'), true) $$),
  'permission denied for table paydays', 'Tom can''t add paydays');
select is(pg_temp.refusal($$ update public.paydays set start_date = '2026-11-02' $$),
  'permission denied for table paydays', 'nor change them');
select is(pg_temp.refusal($$ delete from public.paydays $$),
  'permission denied for table paydays', 'nor remove them');
select is(pg_temp.refusal($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T10:00:00Z',
    'just-this-one', jsonb_build_array(jsonb_build_object('table', 'paydays', 'id', gen_random_uuid(),
      'version', null, 'row', jsonb_build_object('start_date', '2026-11-02')))) $$),
  'bad-edit', 'nor send any through save_edit');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 3. What Tom's phone gets of Jess's pay (D512): its dates, nothing else.
-- Her pay is on her private account, £2,100.00 on the 1st, with £2,150.00
-- on 1 Nov, overtime, a job and a usual week.

select tests.as_person('tom');
select is(pg_temp.paydays_read(), jsonb_build_array(jsonb_build_object(
    'deleted', false, 'person', tests.id('jess'), 'start_date', '2026-11-01',
    'schedule', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}'::jsonb,
    'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'first_number', null,
    'moved_from', '[]'::jsonb, 'moved_to', '[]'::jsonb, 'skipped', '[]'::jsonb)),
  'Tom reads Jess''s paydays: monthly on the 1st from Sun 1 Nov, never ending, nothing moved');
select is_empty($$ select tests.rows_naming(tests.private_ids('jess')) $$,
  'and nothing he reads, paydays included, names any record of Jess''s own');
select ok(pg_temp.paydays_sent() <> '' and pg_temp.paydays_sent() !~ '210000|215000|4500|Jess pay|Shop job|Usual week',
  'Bringing the plan down gives him her paydays, with none of her amounts, names or job');
select ok(position(tests.id('jess-pay')::text in pg_temp.paydays_sent()) = 0
    and position(tests.id('jess-current')::text in pg_temp.paydays_sent()) = 0
    and position(tests.id('jess-job')::text in pg_temp.paydays_sent()) = 0,
  'nor the id of her pay, her account or her job');
select tests.as_test();

-- Jess moves her December payday, removes January's and changes February's amount.
delete from tests.nudges;
select pg_temp.change('jess', $$
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, new_date)
  values (tests.id('jess-pay-moved'), tests.id('plan'), tests.id('jess-pay'), '2026-12-01', 1, '2026-11-27');
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, skipped)
  values (tests.id('jess-pay-skipped'), tests.id('plan'), tests.id('jess-pay'), '2027-01-01', 2, true);
  insert into public.payment_changes (id, plan_id, series_id, original_date, payment_number, amount, note)
  values (tests.id('jess-pay-more'), tests.id('plan'), tests.id('jess-pay'), '2027-02-01', 3, 250000, 'Bonus') $$);
select tests.as_person('tom');
select is(pg_temp.paydays_read() -> 0 -> 'moved_from', '["2026-12-01"]'::jsonb,
  'Tom''s phone gets the payday Jess moved');
select is(pg_temp.paydays_read() -> 0 -> 'moved_to', '["2026-11-27"]'::jsonb, 'and its new date');
select is(pg_temp.paydays_read() -> 0 -> 'skipped', '["2027-01-01"]'::jsonb, 'and the payday she removed');
select ok(pg_temp.paydays_sent() !~ '250000|Bonus|2027-02-01',
  'but nothing of a new amount or note: it isn''t about when she''s paid');
select tests.as_test();
select ok(exists (select 1 from tests.nudges where topic = 'plan:' || tests.id('plan')),
  'A change to her own pay nudges the plan''s phones, so Tom''s looks at once');

-- She changes only her pay's amount from February, for this and all later
-- ones: a split with the same dates, which Tom never hears of (D522).
create temporary table before_split as
  select id, version, seq from public.paydays where person = tests.id('jess');
-- As when it's saved: worked out once the whole change is made.
set constraints all deferred;
select pg_temp.change('jess', $$
  update public.series set end_rule = '{"kind":"after","payments":3}' where id = tests.id('jess-pay');
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number)
  values (tests.id('jess-pay-feb'), tests.id('plan'), tests.id('jess-current'), 'Jess pay', 'in', 'pay', 250000,
    '2027-02-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', '{"kind":"never"}', 'keep',
    tests.id('jess-pay'), '2026-10-25T08:31:00Z', tests.id('jess-pay'), 3) $$);
set constraints all immediate;
select results_eq(
  $$ select id, version, seq from public.paydays where person = tests.id('jess') order by id $$,
  $$ select id, version, seq from before_split order by id $$,
  'A split that changes only her amount from February changes nothing Tom gets, not even a change number');
select pg_temp.change('jess', $$
  update public.series set deleted = true where id = tests.id('jess-pay-feb');
  update public.series set end_rule = '{"kind":"never"}' where id = tests.id('jess-pay') $$);

-- She changes her pay from March for this and all later ones: a split.
select pg_temp.change('jess', $$
  update public.series set end_rule = '{"kind":"on","date":"2027-02-28"}' where id = tests.id('jess-pay');
  insert into public.series (id, plan_id, account_id, name, direction, type, amount, start_date,
    schedule, end_rule, holiday_rule, family_id, family_created_at, split_from, first_number)
  values (tests.id('jess-pay-march'), tests.id('plan'), tests.id('jess-current'), 'Jess pay', 'in', 'pay', 220000,
    '2027-03-26', '{"kind":"monthly","every":1,"on":{"kind":"last-working-day"}}', '{"kind":"never"}', 'keep',
    tests.id('jess-pay'), '2026-10-25T08:31:00Z', tests.id('jess-pay'), 4) $$);
select tests.as_person('tom');
select is(jsonb_array_length(pg_temp.paydays_read()), 2, 'A split gives Tom both parts of her pay''s dates');
select is(pg_temp.paydays_read() -> 0 -> 'end_rule', '{"kind":"on","date":"2027-02-28"}'::jsonb,
  'the first ending in February');
select is((pg_temp.paydays_read() -> 1) - 'person' - 'deleted' - 'moved_from' - 'moved_to' - 'skipped',
  jsonb_build_object('start_date', '2027-03-26',
    'schedule', '{"kind":"monthly","every":1,"on":{"kind":"last-working-day"}}'::jsonb,
    'end_rule', '{"kind":"never"}'::jsonb, 'holiday_rule', 'keep', 'first_number', 4),
  'and the second on the last working day from March, carrying on from payday 4');
select tests.as_test();

-- A schedule with more in it than its dates gives Tom its dates only.
select pg_temp.change('jess', $$
  update public.series set schedule = '{"kind":"monthly","every":1,"on":{"kind":"last-working-day","note":"Shop"},"note":"Shop job"}'
  where id = tests.id('jess-pay-march') $$);
select tests.as_person('tom');
select ok(pg_temp.paydays_sent() ~ 'last-working-day' and pg_temp.paydays_sent() !~ 'Shop',
  'Anything else written into a schedule never reaches Tom, only when it comes');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 4. Only while a shared budget follows her pay.

select pg_temp.change('jess', $$ update public.budgets set deleted = true where id = tests.id('joint-food') $$);
select tests.as_person('tom');
select is(pg_temp.paydays_read(), '[]'::jsonb,
  'With no shared budget following her pay, Tom gets none of its dates');
select tests.as_test();
select is_empty($$ select id from public.paydays where person = tests.id('jess') $$,
  'and the rows he had are left with nothing in them, not even whose they were');
select ok((select bool_and(deleted and num_nonnulls(person, start_date, schedule, end_rule, holiday_rule,
      first_number, moved_from, moved_to, skipped) = 0) from public.paydays where person is null),
  'so his phone takes them off');

select pg_temp.change('jess', $$ update public.budgets set deleted = false where id = tests.id('joint-food') $$);
select tests.as_person('tom');
select is(jsonb_array_length(pg_temp.paydays_read()), 2, 'With it back, so are the dates');
select tests.as_test();

-- A budget that ended over two months ago, whose last month is over, needs none (D522).
select pg_temp.change('jess', $$
  update public.budgets set ends_on = current_date - 100 where id = tests.id('joint-food') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 0::bigint,
  'A shared budget that ended over two months ago gives Tom none of her paydays');
select pg_temp.change('jess', $$
  update public.budgets set ends_on = current_date - 30 where id = tests.id('joint-food') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 2::bigint,
  'One that ended a month ago may still be in its last month, so it does');
select pg_temp.change('jess', $$
  update public.budgets set ends_on = null where id = tests.id('joint-food') $$);

-- Her budget on her own account is never enough: it's private.
select pg_temp.change('jess', $$ update public.budgets set deleted = true where id = tests.id('joint-food') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 0::bigint,
  'A budget on her private account doesn''t give Tom her paydays');
select pg_temp.change('jess', $$ update public.budgets set deleted = false where id = tests.id('joint-food') $$);

-- No main pay: nothing to give.
select pg_temp.change('jess', $$ update public.settings set main_pay_family_id = null where id = tests.id('jess-settings') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 0::bigint,
  'With no main pay, there are no paydays to give');
select pg_temp.change('jess', $$
  update public.settings set main_pay_family_id = tests.id('jess-cafe-pay') where id = tests.id('jess-settings') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 1::bigint,
  'Her cafe job as her main pay gives its dates instead');
select pg_temp.change('jess', $$
  update public.settings set main_pay_family_id = tests.id('jess-pay') where id = tests.id('jess-settings') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 2::bigint,
  'and her main job again, its two parts');

-- Only a budget that lines up with the paydays needs them (D29): a weekly
-- one with monthly pay runs Monday to Sunday.
select tests.as_person('jess');
select is((select count(*) from public.paydays where not deleted and person = tests.id('tom')), 0::bigint,
  'Tom''s weekly travel budget gives Jess none of his paydays: his pay is monthly, so it runs from Monday');
select tests.as_test();
select pg_temp.change('tom', $$
  insert into public.budgets (id, plan_id, account_id, name, amount, every, leaves, starts_on, made_at)
  values (tests.id('tom-meals'), tests.id('plan'), tests.id('joint'), 'Meals out', 6000, 'month', 'at-start',
    '2026-10-25', '2026-10-25T09:00:00Z') $$);
select tests.as_person('jess');
select is((select count(*) from public.paydays where not deleted and person = tests.id('tom')), 1::bigint,
  'His monthly meals out does: Jess gets his paydays, the dates only');
select tests.as_test();
select pg_temp.change('tom', $$
  update public.budgets set leaves = 'pay-later', bill_day = 29 where id = tests.id('tom-meals') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('tom')), 0::bigint,
  'and once it''s on a pay-later card, which follows its bill, no longer');
select pg_temp.change('tom', $$
  update public.budgets set leaves = 'at-start', bill_day = null where id = tests.id('tom-meals') $$);
select pg_temp.change('jess', $$
  update public.series set schedule = '{"kind":"irregular"}' where id = tests.id('jess-pay-march') $$);
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 0::bigint,
  'Irregular pay has no paydays to give: its budgets run Monday to Sunday');
select pg_temp.change('jess', $$
  update public.series set schedule = '{"kind":"monthly","every":1,"on":{"kind":"last-working-day"}}'
  where id = tests.id('jess-pay-march') $$);

-- Both with the same main pay, such as pay into the joint account: each
-- has paydays of their own, and one stopping leaves the other's (D522).
select pg_temp.change('jess', $$
  update public.settings set main_pay_family_id = tests.id('jess-cafe-pay') where id = tests.id('jess-settings') $$);
select pg_temp.change('tom', $$
  update public.settings set main_pay_family_id = tests.id('jess-cafe-pay') where id = tests.id('tom-settings') $$);
select is((select count(distinct id) from public.paydays where not deleted
    and person in (tests.id('jess'), tests.id('tom'))), 2::bigint,
  'Jess and Tom with the same main pay have a row each');
select pg_temp.change('jess', $$ update public.budgets set deleted = true where id = tests.id('joint-food') $$);
select is((select array_agg(person) from public.paydays where not deleted), array[tests.id('tom')],
  'and when hers stops, his stays');
select pg_temp.change('jess', $$ update public.budgets set deleted = false where id = tests.id('joint-food') $$);
select pg_temp.change('jess', $$
  update public.settings set main_pay_family_id = tests.id('jess-pay') where id = tests.id('jess-settings') $$);
select pg_temp.change('tom', $$
  update public.settings set main_pay_family_id = tests.id('tom-pay') where id = tests.id('tom-settings') $$);

-- ---------------------------------------------------------------------------
-- 5. Nobody outside the plan reads them.

select tests.as_person('alex');
select is((select count(*) from public.paydays), 0::bigint, 'Alex, in no plan, reads no paydays');
select tests.as_nobody();
select is(pg_temp.refusal($$ select count(*) from public.paydays $$), 'permission denied for table paydays',
  'Someone signed out can''t ask');
select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');
select is((select count(*) from public.paydays), 0::bigint, 'Tom, once his sign-in has ended, reads none');
select tests.as_test();
insert into auth.sessions (id, user_id) values (tests.id('tom-session'), tests.id('tom'));

-- Someone no longer in the plan, however that came about, gives no paydays.
update public.plan_members set left_at = now() where plan_id = tests.id('plan') and person_id = tests.id('jess');
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 0::bigint,
  'Once Jess is no longer in the plan, her paydays go');
update public.plan_members set left_at = null where plan_id = tests.id('plan') and person_id = tests.id('jess');
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 2::bigint,
  'and come back if she is again');

-- "Can view only" still reads them, as everything shared.
update public.plan_members set role = 'viewer' where plan_id = tests.id('plan') and person_id = tests.id('tom');
select tests.as_person('tom');
select is((select count(*) from public.paydays where not deleted and person = tests.id('jess')), 2::bigint,
  'Tom with "Can view only" reads Jess''s paydays too, as the joint account needs them');
select tests.as_test();
update public.plan_members set role = 'editor' where plan_id = tests.id('plan') and person_id = tests.id('tom');

-- ---------------------------------------------------------------------------
-- 6. When the person who added it leaves (D513): it follows the person who
-- stays, and their paydays go from the plan.

select tests.as_person('jess');
select is(public.leave_plan(tests.id('plan'), false, tests.id('jess-new-plan'), tests.id('jess-leaves'),
    '2026-11-14T10:00:00Z') ->> 'saved', 'new', 'Jess, who owns the plan, leaves it');
select tests.as_test();
select is((select follows_pay_of from public.budgets where id = tests.id('joint-food')), tests.id('tom'),
  'The joint account''s food month now follows Tom''s paydays');
select is((select edit_id from public.budgets where id = tests.id('joint-food')), tests.id('jess-leaves'),
  'as part of her leaving, which Tom''s Activity shows');
select ok((select passed_on from public.budgets where id = tests.id('joint-food')),
  'marked as passed on to him, so his phone says so');
select ok(not (select passed_on from public.budgets where id = tests.id('tom-travel')),
  'and his own travel budget isn''t');
select pg_temp.change('tom', $$ update public.budgets set passed_on = false where id = tests.id('joint-food') $$);
select ok((select passed_on from public.budgets where id = tests.id('joint-food')),
  'Tom''s phone can''t take the mark off');
select is_empty($$ select id from public.paydays where person = tests.id('jess') $$,
  'Her paydays are gone from the plan, with nothing left in them');
select is((select count(*) from public.paydays where not deleted and person = tests.id('tom')), 1::bigint,
  'and his are there, for his own phones');
select is((select count(*) from public.paydays where plan_id = tests.id('jess-new-plan')), 0::bigint,
  'Her own plan has no paydays: nothing in it is shared');
select is((select follows_pay_of from public.budgets where id = tests.id('jess-food')), tests.id('jess'),
  'Her own food budget went with her, still following her own pay');
select tests.as_person('jess');
select is((select count(*) from public.paydays where plan_id = tests.id('plan')), 0::bigint,
  'and she reads none of the plan''s any more');
select tests.as_test();

-- ---------------------------------------------------------------------------
-- 7. With no main pay of his own, the person who stays gets months from the
-- 1st (D29): no paydays at all. And deleting an account leaves first (D482),
-- so the same happens, and nothing names its person afterwards.

select tests.make_person('sam');
insert into public.plan_members (plan_id, person_id, role) values (tests.id('plan'), tests.id('sam'), 'editor');
select pg_temp.change('tom', $$
  update public.settings set main_pay_family_id = null where id = tests.id('tom-settings') $$);
select is((select count(*) from public.paydays where not deleted), 0::bigint,
  'Tom with no main pay gives no paydays, though his budgets are shared');
select pg_temp.change('tom', $$
  update public.settings set main_pay_family_id = tests.id('tom-pay') where id = tests.id('tom-settings') $$);
update auth.sessions set created_at = now() where user_id = tests.id('tom');
select tests.as_person('tom');
select is(public.delete_my_account('delete') ->> 'deleted', 'true', 'Tom deletes his account');
select tests.as_test();
select is((select follows_pay_of from public.budgets where id = tests.id('joint-food')), tests.id('sam'),
  'and the food month follows Sam, who stays');
select is((select count(*) from public.paydays where not deleted), 0::bigint,
  'Sam has no main pay, so there are no paydays');
select is_empty($$ select id from public.paydays where person = tests.id('tom') $$,
  'and none name Tom');

-- ---------------------------------------------------------------------------
-- 8. Budgets from before step 4a, and when parts of a pay are given as one.

-- Every budget's person is filled in once, at a new version, so phones
-- that had it already bring it down again (D522).
alter table public.budgets disable trigger user;
update public.budgets set follows_pay_of = null, passed_on = false where id = tests.id('tom-travel');
update public.budgets set follows_pay_of = null, passed_on = false where id = tests.id('jess-food');
alter table public.budgets enable trigger user;
create temporary table before_filling as select id, version, seq from public.budgets
  where id in (tests.id('tom-travel'), tests.id('jess-food'));
alter table public.budgets disable trigger user;
select is(app.fill_in_budget_follows(), 2, 'Filling in finds the two budgets that don''t say whose paydays they follow');
alter table public.budgets enable trigger user;
select is((select follows_pay_of from public.budgets where id = tests.id('tom-travel')), tests.id('sam'),
  'One added by someone who has left follows the plan''s owner, who stayed');
select ok((select passed_on from public.budgets where id = tests.id('tom-travel')), 'marked passed on');
select is((select follows_pay_of from public.budgets where id = tests.id('jess-food')), tests.id('jess'),
  'One on a private account follows that account''s person');
select ok((select bool_and(b.version = k.version + 1 and b.seq > k.seq)
    from public.budgets b join before_filling k on k.id = b.id),
  'Each at a new version and change number, so every phone brings it down again');

select ok(app.payday_continues('{"start_date":"2026-10-30","schedule":{"kind":"weekly","every":1},
    "holiday_rule":"keep","end_rule":{"kind":"on","date":"2027-01-07"}}',
    '2027-01-08', '{"kind":"weekly","every":1}', 'keep', 10),
  'Weekly pay split on one of its own paydays carries on its dates');
select ok(not app.payday_continues('{"start_date":"2026-10-30","schedule":{"kind":"weekly","every":1},
    "holiday_rule":"keep","end_rule":{"kind":"on","date":"2027-01-07"}}',
    '2027-01-11', '{"kind":"weekly","every":1}', 'keep', 10),
  'but not when it moved to another day of the week');
select ok(not app.payday_continues('{"start_date":"2026-11-01","schedule":{"kind":"monthly","every":3,"on":{"kind":"day","day":1}},
    "holiday_rule":"keep","end_rule":{"kind":"after","payments":2}}',
    '2027-06-01', '{"kind":"monthly","every":3,"on":{"kind":"day","day":1}}', 'keep', 2),
  'nor quarterly pay moved to other months');
select ok(not app.payday_continues('{"start_date":"2026-11-01","schedule":{"kind":"monthly","every":1,"on":{"kind":"day","day":1}},
    "holiday_rule":"keep","end_rule":{"kind":"never"}}',
    '2027-02-01', '{"kind":"monthly","every":1,"on":{"kind":"day","day":1}}', 'keep', 3),
  'nor a part that never ended');

-- ---------------------------------------------------------------------------
-- 9. GraphQL off (D509).

select ok(not exists (select 1 from pg_extension where extname = 'pg_graphql'), 'GraphQL is off');
create extension pg_graphql;
select is(app.keep_graphql_off(), 'switched-off', 'Switched back on, the Database workflow''s check switches it off');
select ok(not exists (select 1 from pg_extension where extname = 'pg_graphql'), 'and it''s off');
select is(app.keep_graphql_off(), 'off', 'Off already, the check says so and changes nothing');
select ok(not has_function_privilege('authenticated', 'app.keep_graphql_off()', 'execute')
    and not has_function_privilege('anon', 'app.keep_graphql_off()', 'execute'),
  'Only the database''s own roles can run it');

select * from finish();
rollback;
