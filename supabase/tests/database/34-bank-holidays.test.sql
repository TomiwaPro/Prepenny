-- Step 4c: the bank holiday list a plan's dates are worked out from (D536).
--
-- Proves: everyone in the plan reads it and nobody else; only someone who
-- can change the plan sends a newer one, through use_bank_holidays, never
-- by writing the table; a list no newer than the plan's changes nothing,
-- so two phones sending at once end on the same; and it comes down with the
-- plan's other records, once, with a nudge for the other phone.

begin;
create extension if not exists pgtap with schema extensions;

select plan(41);

select tests.make_jess_and_tom();

-- A refusal's message, as the phone gets it.
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
grant execute on function pg_temp.refusal(text) to anon, authenticated;

-- A small list in GOV.UK's shape, with a title for its one-off day.
create function pg_temp.list(extra text default 'Christmas Day') returns jsonb language sql as $$
  select jsonb_build_object(
    'england-and-wales', jsonb_build_object('division', 'england-and-wales', 'events', jsonb_build_array(
      jsonb_build_object('title', 'New Year’s Day', 'date', '2027-01-01', 'notes', '', 'bunting', true),
      jsonb_build_object('title', extra, 'date', '2027-12-25', 'notes', '', 'bunting', true))),
    'scotland', jsonb_build_object('events', jsonb_build_array(
      jsonb_build_object('title', 'New Year’s Day', 'date', '2027-01-01'))),
    'northern-ireland', jsonb_build_object('events', jsonb_build_array(
      jsonb_build_object('title', 'New Year’s Day', 'date', '2027-01-01'))))
$$;
grant execute on function pg_temp.list(text) to anon, authenticated;

-- A version: a day some days from today, London time, and a checksum made of
-- one hex digit. Days from today, as no list can be from after tomorrow.
create function pg_temp.v(days integer, digit text) returns text language sql as $$
  select to_char((now() at time zone 'Europe/London')::date + days, 'YYYY-MM-DD') || ':' || repeat(digit, 64)
$$;
grant execute on function pg_temp.v(integer, text) to anon, authenticated;

-- The plan's list as the test sees it.
create function pg_temp.stored() returns text language sql security definer as $$
  select coalesce((select list_version from public.bank_holidays where plan_id = tests.id('plan')), 'none')
$$;
grant execute on function pg_temp.stored() to anon, authenticated;

-- What plan_changes gives the person acting now of the list, after a change number.
create function pg_temp.sent(after bigint default 0) returns jsonb language sql as $$
  select coalesce(jsonb_agg(r -> 'row' -> 'list_version'), '[]'::jsonb)
  from jsonb_array_elements(public.plan_changes(tests.id('plan'), after, 0) -> 'rows') r
  where r ->> 'table' = 'bank_holidays'
$$;
grant execute on function pg_temp.sent(bigint) to authenticated;

-- Nudges, caught here instead of sent, for this test only, as 33 does.
create table tests.nudges (topic text);
grant insert, select, delete on tests.nudges to authenticated;
create or replace function app.send_nudge(topic text) returns void
language sql security definer set search_path = '' as $$
  insert into tests.nudges (topic) values (topic)
$$;

-- ---------------------------------------------------------------------------
-- 1. The table: its rules, and nobody writes it straight.

select ok((select rowsecurity from pg_tables where schemaname = 'public' and tablename = 'bank_holidays'),
  'The plan''s list has its privacy rules switched on');
select is(pg_temp.stored(), 'none', 'A plan starts with no list of its own: phones use their built-in copy');

select tests.as_person('jess');
select is(pg_temp.refusal($$ insert into public.bank_holidays (id, plan_id, list_version, list)
    values (gen_random_uuid(), tests.id('plan'), pg_temp.v(0, 'a'), pg_temp.list()) $$),
  'permission denied for table bank_holidays', 'Jess can''t write the list straight into the table');

-- ---------------------------------------------------------------------------
-- 2. A newer list, from someone who can change the plan.

select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-17, 'b'), pg_temp.list()),
  jsonb_build_object('saved', pg_temp.v(-17, 'b')), 'Jess sends the list her phone has');
select is(pg_temp.stored(), pg_temp.v(-17, 'b'), 'and the plan keeps it');
select is((select count(*)::integer from tests.nudges where topic = 'plan:' || tests.id('plan')), 1,
  'with a nudge, so Tom''s phone looks straight away');
select is(pg_temp.sent(), jsonb_build_array(pg_temp.v(-17, 'b')), 'It comes down to Jess with the plan');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-17, 'b'), pg_temp.list()),
  jsonb_build_object('kept', pg_temp.v(-17, 'b')), 'The same list again changes nothing');

select tests.as_person('tom');
select is(pg_temp.sent(), jsonb_build_array(pg_temp.v(-17, 'b')), 'Tom reads it too');
select is((select count(*)::integer from public.bank_holidays), 1, 'one row, the plan''s');
select tests.as_test();
select is(
  (select seq from public.bank_holidays where plan_id = tests.id('plan'))
    > (select coalesce(max(seq), 0) from public.series where plan_id = tests.id('plan') and private_to is null),
  true, 'Its change number follows the plan''s shared records, so phones ask for it like them');
delete from tests.nudges;

select tests.as_person('tom');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-2, 'c'), pg_temp.list('A one-off')),
  jsonb_build_object('saved', pg_temp.v(-2, 'c')), 'Tom, who can edit, sends a newer list his phone fetched');
select is(pg_temp.stored(), pg_temp.v(-2, 'c'), 'and the plan has it');
select is((select list -> 'england-and-wales' -> 'events' -> 1 ->> 'title' from public.bank_holidays),
  'A one-off', 'with its new bank holiday');
select is((select count(*)::integer from tests.nudges where topic = 'plan:' || tests.id('plan')), 1,
  'and a nudge for Jess''s phone');

select tests.as_person('jess');
select is(pg_temp.sent(), jsonb_build_array(pg_temp.v(-2, 'c')), 'Jess''s phone gets the newer one');
select is(pg_temp.sent((select seq from public.bank_holidays)), '[]'::jsonb,
  'and once it has it, not again');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-17, 'b'), pg_temp.list()),
  jsonb_build_object('kept', pg_temp.v(-2, 'c')),
  'Her phone sending the older one it had changes nothing, and says which the plan has');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'c'), pg_temp.list('A one-off')),
  jsonb_build_object('kept', pg_temp.v(-2, 'c')),
  'nor does the same list downloaded again on a later day');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-2, 'd'), pg_temp.list('Another')),
  jsonb_build_object('saved', pg_temp.v(-2, 'd')),
  'Two different lists from the same day: the larger checksum is newer, as on every phone');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(-2, 'c'), pg_temp.list('A one-off')),
  jsonb_build_object('kept', pg_temp.v(-2, 'd')), 'so the other one of that day can''t replace it');

-- ---------------------------------------------------------------------------
-- 3. Who can't.

select tests.as_test();
update public.plan_members set role = 'viewer' where person_id = tests.id('tom');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'), pg_temp.list()) $$),
  'view-only', 'Tom with "Can view only" can''t send a list (D51)');
select is(pg_temp.sent(), jsonb_build_array(pg_temp.v(-2, 'd')), 'but reads the plan''s, so his dates are Jess''s');
select tests.as_test();
update public.plan_members set role = 'editor' where person_id = tests.id('tom');

select tests.as_person('alex');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'), pg_temp.list()) $$),
  'not-found', 'Alex, in no plan, can''t send one');
select is((select count(*)::integer from public.bank_holidays), 0, 'nor read the plan''s');

select tests.as_nobody();
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'), pg_temp.list()) $$),
  'permission denied for function use_bank_holidays', 'Someone signed out can''t either');

select tests.as_test();
delete from auth.sessions where id = tests.id('tom-session');
select tests.as_person('tom');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'), pg_temp.list()) $$),
  'not-found', 'Nor Tom once his sign-in has ended (D21)');
select is((select count(*)::integer from public.bank_holidays), 0, 'and he reads nothing then');

-- ---------------------------------------------------------------------------
-- 4. Only GOV.UK's shape, and a real day.

select tests.as_person('jess');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), '2026-11-30', pg_temp.list()) $$),
  'bad-list', 'A version with no checksum is refused');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), '2026-02-30:' || repeat('e', 64), pg_temp.list()) $$),
  'bad-list', 'and one on a day there isn''t');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(1, 'e'), pg_temp.list()) $$),
  'bad-list', 'and one downloaded after today, which would hold every real list back (D543)');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), '1899-12-31:' || repeat('e', 64), pg_temp.list()) $$),
  'bad-list', 'and one from before GOV.UK''s list began, which no phone could read');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    pg_temp.list() - 'scotland') $$),
  'bad-list', 'A list without Scotland is refused');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{scotland,events,0,date}', '"2027-02-30"')) $$),
  'bad-list', 'and one with a day there isn''t');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    pg_temp.list(repeat('x', 201))) $$),
  'bad-list', 'and one with a title too long to be GOV.UK''s');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{england-and-wales,events,0,date}', '20270101')) $$),
  'bad-list', 'and one with a date that isn''t text');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{scotland,events,0,date}', '"3000-01-01"')) $$),
  'bad-list', 'A list with a year no phone can read is refused (D543)');
select is(pg_temp.refusal($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{scotland,events,0,notes}', 'null')) $$),
  'bad-list', 'and one with notes that aren''t text');
select is(pg_temp.refusal(format($$ select public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{england-and-wales,events}', %L::jsonb)) $$,
    (select jsonb_agg(jsonb_build_object('title', 'Made up', 'date', d::date::text))
     from generate_series(date '2027-07-01', date '2027-07-07', interval '1 day') d)::text)),
  'bad-list', 'and one with 7 bank holidays in 15 days, which could leave a payment no working day');
select is(public.use_bank_holidays(tests.id('plan'), pg_temp.v(0, 'e'),
    jsonb_set(pg_temp.list(), '{england-and-wales,events}',
      (select jsonb_agg(jsonb_build_object('title', 'Made up', 'date', d::date::text))
       from generate_series(date '2027-07-01', date '2027-07-06', interval '1 day') d))),
  jsonb_build_object('saved', pg_temp.v(0, 'e')), 'but 6 in 15 days is taken');
select is(pg_temp.stored(), pg_temp.v(0, 'e'), 'None of the others changed the plan''s list');

select * from finish();
rollback;
