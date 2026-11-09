-- Step 3e: a phone on an older version of PrePenny never quietly keeps a
-- different plan. Every request through the Data API names the version of
-- the database its app was built for (x-prepenny-version, the newest
-- migration it knows). Only the version this database is gets anything:
-- - An app built for an older database, or with no version at all, as the
--   PrePenny from before step 3e, reads nothing and saves nothing, so its
--   changes wait on the phone until it has updated itself, and its look at
--   its sign-in (hello) says "update-needed".
-- - An app built for a newer database, in the minutes after an update while
--   this one is still being changed, gets nothing either, and is told
--   "server-behind", so it waits.
-- - The database's own work and Realtime don't come through the Data API,
--   and aren't checked.
-- Also PLAN.md item 39: each change notes the device it was made on, by kind.

begin;
create extension if not exists pgtap with schema extensions;

select plan(16);

select tests.make_jess_and_tom('editor');

select is(app.database_version(), (select max(version) from supabase_migrations.schema_migrations),
  'The database''s version is its newest migration');

-- The right version, through the Data API.
select tests.as_person('jess');
select tests.through_the_data_api();
select is(public.hello() ->> 'version', 'ok', 'An app built for this database is told all is well');
select isnt_empty($$ select * from tests.readable_rows() $$, 'and reads the plan');
select lives_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, 'and brings it down');

-- An older version.
select tests.through_the_data_api('20261109100000');
select is(public.hello() ->> 'version', 'update-needed', 'An app built for an older database is told to update');
select is(public.hello() ->> 'sign_in', 'ok', 'while its sign-in still stands');
select is_empty($$ select * from tests.readable_rows() $$, 'It reads nothing in any table');
select throws_ok($$ select public.plan_changes(tests.id('plan'), 0, 0) $$, '42501', 'not-found',
  'can''t bring the plan down');
select throws_ok($$ select public.save_edit(tests.id('plan'), gen_random_uuid(), '2026-11-07T10:00:00Z', 'tick',
    jsonb_build_array(jsonb_build_object('table', 'ticks', 'id', gen_random_uuid(), 'version', null,
      'row', jsonb_build_object('series_id', tests.id('rent'), 'original_date', '2026-12-01',
        'payment_number', 1, 'paid_on', '2026-12-01', 'ticked_at', '2026-12-01T09:00:00Z', 'list_order', 0)))) $$,
  '42501', 'not-found', 'and can''t save a change');

-- No version at all, as every PrePenny from before step 3e.
select set_config('request.headers', '{}', true);
select is(public.hello() ->> 'version', 'update-needed', 'An app that names no version is told to update');
select is_empty($$ select * from tests.readable_rows() $$, 'and reads nothing');

-- A newer version.
select tests.through_the_data_api('29991231235959');
select is(public.hello() ->> 'version', 'server-behind', 'An app built for a newer database is told to wait');
select is_empty($$ select * from tests.readable_rows() $$, 'and reads nothing either');

-- Not through the Data API: the database's own work, its tests and Realtime.
select set_config('request.path', '', true);
select set_config('request.headers', '', true);
select isnt_empty($$ select * from tests.readable_rows() $$,
  'A request that doesn''t come through the Data API isn''t asked for a version');

-- Item 39: the device each change was made on.
select tests.as_test();
update auth.sessions set user_agent =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'
  where id = tests.id('jess-session');
select tests.as_person('jess');
select app.begin_edit(tests.id('plan'), tests.id('jess-edit'), '2026-11-08T09:00:00Z', 'test');
select tests.as_test();
select is((select browser || ' ' || device from app.edit_devices where edit_id = tests.id('jess-edit')),
  'safari iphone', 'A change notes the kind of device it was made on');
select is((select session_id from app.edit_devices where edit_id = tests.id('jess-edit')), tests.id('jess-session'),
  'and which of the person''s sign-ins');

select * from finish();
rollback;
