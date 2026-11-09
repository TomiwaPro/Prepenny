-- Step 3e-2, from the owner's report (D404): the "Someone asked to get into
-- your account" notice reaches every signed-in device, whichever version of
-- PrePenny it's on. `hello` tells any version whose sign-in stands about an
-- open request to get back in: it's about the person's own account and holds
-- no plan data. Plan data still goes only to the version this database is
-- (20-versions.test.sql).

begin;
create extension if not exists pgtap with schema extensions;

select plan(12);

select tests.make_jess_and_tom('editor');
insert into app.backup_emails (person_id, email) values (tests.id('jess'), 'jess.backup@example.test');
select app.start_get_back_in(tests.id('jess'), 'jess.backup@example.test');
-- When it could finish, as the database keeps it, for the checks below.
select set_config('tests.ready_at', (select app.utc_words(app.ready_at(r)) from app.get_back_in r
  where r.person_id = tests.id('jess')), true);

-- The version this database is.
select tests.as_person('jess');
select tests.through_the_data_api();
select is(public.hello() ->> 'version', 'ok', 'Jess''s phone is on the version this database is');
select ok(public.hello() -> 'get_back_in' ->> 'ready_at' is not null, 'and is told someone asked to get into her account');

-- An older version, as every phone is for a while after an update.
select tests.through_the_data_api('20261111100000');
select is(public.hello() ->> 'version', 'update-needed', 'A phone on the version before is told to update');
select ok(public.hello() -> 'get_back_in' ->> 'ready_at' is not null, 'and is told someone asked to get into her account too');
select is(public.hello() -> 'get_back_in' ->> 'ready_at', current_setting('tests.ready_at'),
  'with when it could finish, 24 hours on');
select is_empty($$ select * from tests.readable_rows() $$, 'but it still reads nothing of the plan');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', 'not-found',
  'and can''t bring the plan down');

-- No version at all, as the PrePenny from before step 3e.
select set_config('request.headers', '{}', true);
select ok(public.hello() -> 'get_back_in' ->> 'ready_at' is not null, 'A phone that names no version is told too');

-- A newer version, in the minutes after an update while the database is still being changed.
select tests.through_the_data_api('29991231235959');
select is(public.hello() ->> 'version', 'server-behind', 'A phone on a newer version is told to wait');
select ok(public.hello() -> 'get_back_in' ->> 'ready_at' is not null, 'and is told too');

-- Only Jess, and only while her sign-in stands.
select tests.as_person('tom');
select tests.through_the_data_api('20261111100000');
select ok(public.hello() -> 'get_back_in' = 'null'::jsonb, 'Tom''s phone isn''t told, though he shares her plan');
select tests.as_test();
delete from auth.sessions where id = tests.id('jess-session');
select tests.as_person('jess');
select tests.through_the_data_api('20261111100000');
select ok(public.hello() ->> 'sign_in' = 'ended' and public.hello() -> 'get_back_in' = 'null'::jsonb,
  'A phone whose sign-in has ended is told nothing but that');

select * from finish();
rollback;
