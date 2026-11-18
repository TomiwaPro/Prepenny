-- Step 4e: bank holiday lists only from PrePenny itself (D545).
--
-- Proves: the database takes the answer from PrePenny's own site only when
-- it's a list in GOV.UK's shape, within the limits every phone can read
-- (D543), with a real version; keeps it; and gives every plan the newest
-- list it fetched, replacing any list it never fetched itself, such as a
-- made-up one; an older fetched list never replaces a newer one; the
-- site's answer is taken once it comes back, and nothing is taken from an
-- error or no answer; and nobody else can run any of it.

begin;
create extension if not exists pgtap with schema extensions;

select plan(30);

select tests.make_jess_and_tom();

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

-- A small list in GOV.UK's shape, as in 34-bank-holidays.test.sql.
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

-- PrePenny's site's file (apps/web/scripts/build-worker.ts): the list, with
-- its version, the day it was downloaded from GOV.UK and its checksum.
create function pg_temp.file(days integer, digit text, list jsonb default pg_temp.list()) returns text
language sql as $$
  select jsonb_build_object(
    'version', to_char((now() at time zone 'Europe/London')::date + days, 'YYYY-MM-DD') || ':' || repeat(digit, 64),
    'source', 'https://www.gov.uk/bank-holidays.json',
    'downloaded_on', to_char((now() at time zone 'Europe/London')::date + days, 'YYYY-MM-DD'),
    'sha256', repeat(digit, 64),
    'list', list)::text
$$;
create function pg_temp.v(days integer, digit text) returns text language sql as $$
  select to_char((now() at time zone 'Europe/London')::date + days, 'YYYY-MM-DD') || ':' || repeat(digit, 64)
$$;
create function pg_temp.stored() returns text language sql as $$
  select coalesce((select list_version from public.bank_holidays where plan_id = tests.id('plan')), 'none')
$$;

create table tests.nudges (topic text);
create or replace function app.send_nudge(topic text) returns void
language sql security definer set search_path = '' as $$
  insert into tests.nudges (topic) values (topic)
$$;

-- Jess's plan, and one of Alex's own.
insert into public.plans (id, name, owner) values (tests.id('alex-plan'), 'Alex''s plan', tests.id('alex'));

-- ---------------------------------------------------------------------------
-- 1. A good list from the site: kept, and given to every plan.

select is(pg_temp.stored(), 'none', 'Jess''s plan starts with no list');
select is(app.take_bank_holiday_list(pg_temp.file(-10, 'a')), 'taken', 'The site''s list is taken');
select is((select count(*)::integer from app.bank_holiday_lists), 1, 'and kept as one the database fetched');
select is(pg_temp.stored(), pg_temp.v(-10, 'a'), 'Jess and Tom''s plan has it');
select is((select list_version from public.bank_holidays where plan_id = tests.id('alex-plan')),
  pg_temp.v(-10, 'a'), 'and so has Alex''s: every plan');
select ok(exists (select 1 from tests.nudges where topic = 'plan:' || tests.id('plan')),
  'with a nudge, so their phones bring it down straight away');

delete from tests.nudges;
select is(app.take_bank_holiday_list(pg_temp.file(-10, 'a')), 'taken', 'The same list again is fine');
select is((select version from public.bank_holidays where plan_id = tests.id('plan')), 1,
  'and changes nothing in a plan');
select is((select count(*)::integer from tests.nudges), 0, 'so nobody is nudged');

select is(app.take_bank_holiday_list(pg_temp.file(-3, 'b', pg_temp.list('A one-off'))), 'taken',
  'A newer list from the site');
select is(pg_temp.stored(), pg_temp.v(-3, 'b'), 'replaces the plan''s');
select is(app.take_bank_holiday_list(pg_temp.file(-20, 'c')), 'taken', 'An older one, fetched later');
select is(pg_temp.stored(), pg_temp.v(-3, 'b'), 'never replaces a newer one');

-- ---------------------------------------------------------------------------
-- 2. A list the database never fetched is replaced, as a made-up one (D543).

update public.bank_holidays set list_version = pg_temp.v(0, 'f'), list = pg_temp.list('Made up')
  where plan_id = tests.id('plan');
select is(app.give_plans_the_newest_list(), 1, 'The next list the database takes');
select is(pg_temp.stored(), pg_temp.v(-3, 'b'), 'replaces a list it never fetched, even one dated later');
select is((select list -> 'england-and-wales' -> 'events' -> 1 ->> 'title' from public.bank_holidays
  where plan_id = tests.id('plan')), 'A one-off', 'with its own copy');

-- ---------------------------------------------------------------------------
-- 3. Only GOV.UK's shape, a real version, and a real day (D543).

select is(app.take_bank_holiday_list('not a list'), 'bad-list', 'An answer that isn''t JSON is refused');
select is(app.take_bank_holiday_list((pg_temp.file(-1, 'd')::jsonb - 'downloaded_on')::text), 'bad-list',
  'and one whose version doesn''t match the day it says it was downloaded');
select is(app.take_bank_holiday_list(jsonb_set(pg_temp.file(-1, 'd')::jsonb, '{sha256}', to_jsonb(repeat('e', 64)))::text),
  'bad-list', 'or its checksum');
select is(app.take_bank_holiday_list(pg_temp.file(1, 'd')), 'bad-list',
  'and one downloaded after today, which would hold every real list back');
select is(app.take_bank_holiday_list(replace(pg_temp.file(0, 'd'),
    to_char((now() at time zone 'Europe/London')::date, 'YYYY-MM-DD'), '1899-12-31')), 'bad-list',
  'and one from before GOV.UK''s list began');
select is(app.take_bank_holiday_list(pg_temp.file(-1, 'd', pg_temp.list() - 'scotland')), 'bad-list',
  'A list without Scotland is refused');
select is(app.take_bank_holiday_list(pg_temp.file(-1, 'd',
    jsonb_set(pg_temp.list(), '{scotland,events,0,date}', '"3000-01-01"'))), 'bad-list',
  'and one with a year no phone can read');
select is(app.take_bank_holiday_list(pg_temp.file(-1, 'd', jsonb_set(pg_temp.list(), '{england-and-wales,events}',
    (select jsonb_agg(jsonb_build_object('title', 'Made up', 'date', d::date::text))
     from generate_series(date '2027-07-01', date '2027-07-07', interval '1 day') d)))), 'bad-list',
  'and one with 7 bank holidays in 15 days');
select is(pg_temp.stored(), pg_temp.v(-3, 'b'), 'None of them changed the plan''s list');
select is((select count(*)::integer from app.bank_holiday_lists), 3, 'or was kept');

-- ---------------------------------------------------------------------------
-- 4. The site's answer, taken once it comes back.

insert into app.bank_holiday_fetches (request_id, asked_at) values
  (-1, now()), (-2, now()), (-3, now() - interval '2 hours'), (-4, now());
insert into net._http_response (id, status_code, content) values
  (-1, 200, pg_temp.file(-1, 'e', pg_temp.list('From the site'))),
  (-2, 404, pg_temp.file(0, 'f'));
select app.take_fetched_bank_holidays();
select is(pg_temp.stored(), pg_temp.v(-1, 'e'), 'The site''s answer is taken once it has come back');
select is((select array_agg(request_id order by request_id) from app.bank_holiday_fetches), array[-4::bigint],
  'An error answer is taken as nothing, one with no answer after an hour is given up, one still waiting stays');

-- ---------------------------------------------------------------------------
-- 5. Nobody else can.

select tests.as_person('jess');
select is(pg_temp.refusal($$ select app.take_bank_holiday_list('{}') $$),
  'permission denied for function take_bank_holiday_list', 'Jess can''t give the database a list');
select tests.as_nobody();
select is(pg_temp.refusal($$ select app.ask_for_bank_holidays() $$),
  'permission denied for schema app', 'nor can someone signed out make it fetch one');

select * from finish();
rollback;
